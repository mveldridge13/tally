-- Member privacy.
--
-- The owner of a group sees everything in it. Everyone else sees only:
--   * expenses they added (and those expenses' splits and edit history)
--   * payments they recorded themselves
-- Balances still come from the whole ledger, so they are worked out here on the server
-- (my_group_summaries) and each person gets only what they're allowed to see: the owner gets
-- every balance and the full "who pays whom" list; a member gets their own balance and only
-- the lines that include them.

-- ─── Helpers ─────────────────────────────────────────────────────────────────

-- Is the current user the (active) owner of the group? SECURITY DEFINER, like is_group_member,
-- so policies can call it without recursing into group_members' own policy. A deleted
-- (archived) group has no owner here, exactly as it has no members in is_group_member.
create function public.is_group_owner(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.group_members m
    join public.groups g on g.id = m.group_id
    where m.group_id = p_group_id
      and m.user_id = (select auth.uid())
      and m.left_at is null
      and m.role = 'owner'
      and g.archived_at is null
  );
$$;

-- Can the current user see this expense? Owner of its group, or the member who added it.
create function public.can_see_expense(p_group_id uuid, p_created_by uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_group_owner(p_group_id)
      or (p_created_by = (select auth.uid()) and public.is_group_member(p_group_id));
$$;

-- Can the current user see this payment? Owner, or a member who paid, received or recorded it.
create function public.can_see_settlement(p_group_id uuid, p_from uuid, p_to uuid, p_created_by uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  -- Members see only payments they recorded themselves, the same rule as expenses.
  -- p_from / p_to are kept in the signature so callers don't change.
  select public.is_group_owner(p_group_id)
      or ((select auth.uid()) = p_created_by and public.is_group_member(p_group_id));
$$;

-- ─── Read rules ──────────────────────────────────────────────────────────────

drop policy "members read expenses" on public.expenses;
drop policy "members read splits" on public.expense_splits;
drop policy "members read revisions" on public.expense_revisions;
drop policy "members read settlements" on public.settlements;

create policy "owner or creator reads expenses" on public.expenses for select to authenticated
  using (public.can_see_expense(group_id, created_by));

create policy "read splits of visible expenses" on public.expense_splits for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.can_see_expense(e.group_id, e.created_by)));

create policy "read revisions of visible expenses" on public.expense_revisions for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.can_see_expense(e.group_id, e.created_by)));

create policy "owner or party reads settlements" on public.settlements for select to authenticated
  using (public.can_see_settlement(group_id, from_user_id, to_user_id, created_by));

-- ─── Edit rules: only what you can see ───────────────────────────────────────
-- Same bodies as before; only the "not found" checks change from "any member" to "can see it".

create or replace function public.update_expense(
  p_expense_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_payer_id uuid,
  p_split_method public.split_method,
  p_splits jsonb,
  p_occurred_at timestamptz,
  p_notes text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_group uuid;
  v_creator uuid;
begin
  select group_id, created_by into v_group, v_creator from public.expenses where id = p_expense_id and deleted_at is null for update;
  if v_group is null or not public.can_see_expense(v_group, v_creator) then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if not public.is_member_of(v_group, p_payer_id) then
    raise exception 'The payer must be a member of the group' using errcode = '22023';
  end if;
  perform public.validate_splits(v_group, p_amount_cents, p_splits);

  insert into public.expense_revisions (expense_id, edited_by, before)
  values (p_expense_id, uid, public.expense_snapshot(p_expense_id));

  update public.expenses
  set description = trim(p_description), amount_cents = p_amount_cents, payer_id = p_payer_id,
      split_method = p_split_method, occurred_at = p_occurred_at, notes = p_notes
  where id = p_expense_id;

  delete from public.expense_splits where expense_id = p_expense_id;
  insert into public.expense_splits (expense_id, user_id, amount_cents, weight)
  select p_expense_id, (s ->> 'user_id')::uuid, (s ->> 'amount_cents')::bigint, (s ->> 'weight')::integer
  from jsonb_array_elements(p_splits) s;
end $$;

create or replace function public.delete_expense(p_expense_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_group uuid;
  v_creator uuid;
begin
  select group_id, created_by into v_group, v_creator from public.expenses where id = p_expense_id and deleted_at is null for update;
  if v_group is null or not public.can_see_expense(v_group, v_creator) then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;

  insert into public.expense_revisions (expense_id, edited_by, before)
  values (p_expense_id, uid, public.expense_snapshot(p_expense_id));

  update public.expenses set deleted_at = now() where id = p_expense_id;
end $$;

create or replace function public.void_settlement(p_settlement_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  old public.settlements;
begin
  perform public.require_user();
  select * into old from public.settlements where id = p_settlement_id and status = 'recorded' for update;
  if old.id is null or not public.can_see_settlement(old.group_id, old.from_user_id, old.to_user_id, old.created_by) then
    raise exception 'Settlement not found' using errcode = 'P0002';
  end if;
  update public.settlements set status = 'voided' where id = p_settlement_id;
end $$;

create or replace function public.correct_settlement(
  p_settlement_id uuid,
  p_amount_cents bigint,
  p_occurred_at timestamptz default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  old public.settlements;
  v_id uuid;
begin
  select * into old from public.settlements
  where id = p_settlement_id and status = 'recorded'
  for update;
  if old.id is null or not public.can_see_settlement(old.group_id, old.from_user_id, old.to_user_id, old.created_by) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;
  if not public.is_member_of(old.group_id, old.from_user_id) or not public.is_member_of(old.group_id, old.to_user_id) then
    raise exception 'Both people must still be members of the group' using errcode = '22023';
  end if;

  update public.settlements set status = 'voided' where id = old.id;

  insert into public.settlements (group_id, from_user_id, to_user_id, amount_cents, occurred_at, note, created_by, replaces_id)
  values (old.group_id, old.from_user_id, old.to_user_id, p_amount_cents, coalesce(p_occurred_at, old.occurred_at), p_note, uid, old.id)
  returning id into v_id;

  return v_id;
end $$;

-- ─── Balances, worked out on the server ──────────────────────────────────────

-- "Who pays whom" for one group: the same greedy method as simplifyDebts in
-- packages/shared/src/balance.ts (largest creditor and largest debtor first, ties by id),
-- so the amounts match what the app showed when it worked them out itself.
-- Internal: no access check, not executable by clients.
create function public.simplified_transfers(p_group_id uuid)
returns table (from_user_id uuid, to_user_id uuid, amount_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  c_id uuid[]; c_amt bigint[];
  d_id uuid[]; d_amt bigint[];
  ci int; di int; i int; amt bigint;
begin
  select coalesce(array_agg(b.user_id), '{}'), coalesce(array_agg(b.balance_cents), '{}')
    into c_id, c_amt
  from (
    select m.user_id, public.member_net_balance(p_group_id, m.user_id) as balance_cents
    from (select distinct user_id from public.group_members where group_id = p_group_id) m
  ) b where b.balance_cents > 0;
  select coalesce(array_agg(b.user_id), '{}'), coalesce(array_agg(-b.balance_cents), '{}')
    into d_id, d_amt
  from (
    select m.user_id, public.member_net_balance(p_group_id, m.user_id) as balance_cents
    from (select distinct user_id from public.group_members where group_id = p_group_id) m
  ) b where b.balance_cents < 0;

  loop
    -- Pick the largest remaining creditor and debtor (ties: lowest id as text, like the app).
    ci := null; di := null;
    for i in 1 .. coalesce(array_length(c_id, 1), 0) loop
      if c_amt[i] > 0 and (ci is null or c_amt[i] > c_amt[ci]
          or (c_amt[i] = c_amt[ci] and c_id[i]::text collate "C" < c_id[ci]::text collate "C")) then
        ci := i;
      end if;
    end loop;
    for i in 1 .. coalesce(array_length(d_id, 1), 0) loop
      if d_amt[i] > 0 and (di is null or d_amt[i] > d_amt[di]
          or (d_amt[i] = d_amt[di] and d_id[i]::text collate "C" < d_id[di]::text collate "C")) then
        di := i;
      end if;
    end loop;
    exit when ci is null or di is null;

    amt := least(c_amt[ci], d_amt[di]);
    from_user_id := d_id[di]; to_user_id := c_id[ci]; amount_cents := amt;
    return next;
    c_amt[ci] := c_amt[ci] - amt;
    d_amt[di] := d_amt[di] - amt;
  end loop;
end $$;

-- One entry per group you're in, with only what you may see:
--   { group_id, role, my_balance, my_share,
--     balances: [{ user_id, balance_cents }]   -- owner: everyone; member: only you
--     transfers: [{ from_user_id, to_user_id, amount_cents }]   -- owner: all; member: only yours
--     total_spent }                             -- everyone: the group's total spending
create function public.my_group_summaries() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  g record;
  owner boolean;
  result jsonb := '[]'::jsonb;
begin
  for g in
    select m.group_id, m.role
    from public.group_members m
    join public.groups gr on gr.id = m.group_id
    where m.user_id = uid and m.left_at is null and gr.archived_at is null
  loop
    owner := g.role = 'owner';
    result := result || jsonb_build_array(jsonb_build_object(
      'group_id', g.group_id,
      'role', g.role,
      'my_balance', public.member_net_balance(g.group_id, uid),
      'my_share', (
        select coalesce(sum(s.amount_cents), 0)::bigint
        from public.expense_splits s join public.expenses e on e.id = s.expense_id
        where e.group_id = g.group_id and e.deleted_at is null and s.user_id = uid
      ),
      'total_spent', (
        select coalesce(sum(e.amount_cents), 0)::bigint
        from public.expenses e where e.group_id = g.group_id and e.deleted_at is null
      ),
      'balances', (
        select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id,
                 'balance_cents', public.member_net_balance(g.group_id, m.user_id))), '[]'::jsonb)
        from (select distinct user_id from public.group_members where group_id = g.group_id) m
        where owner or m.user_id = uid
      ),
      'transfers', (
        select coalesce(jsonb_agg(jsonb_build_object('from_user_id', t.from_user_id,
                 'to_user_id', t.to_user_id, 'amount_cents', t.amount_cents)), '[]'::jsonb)
        from public.simplified_transfers(g.group_id) t
        where owner or uid in (t.from_user_id, t.to_user_id)
      )
    ));
  end loop;
  return result;
end $$;

-- group_balances() returned every member's balance to any member; keep it for owners only.
create or replace function public.group_balances(p_group_id uuid)
returns table (user_id uuid, balance_cents bigint)
language sql stable security definer set search_path = '' as $$
  select m.user_id, public.member_net_balance(p_group_id, m.user_id)
  from (select distinct user_id from public.group_members where group_id = p_group_id) m
  where public.is_group_owner(p_group_id);
$$;

-- ─── Who may call what ───────────────────────────────────────────────────────

revoke execute on function
  public.is_group_owner(uuid),
  public.can_see_expense(uuid, uuid),
  public.can_see_settlement(uuid, uuid, uuid, uuid),
  public.simplified_transfers(uuid),
  public.my_group_summaries()
from public, anon;
grant execute on function public.my_group_summaries() to authenticated;
-- Policies call these as the signed-in user, so they must stay executable for them.
grant execute on function
  public.is_group_owner(uuid),
  public.can_see_expense(uuid, uuid),
  public.can_see_settlement(uuid, uuid, uuid, uuid)
to authenticated;
revoke execute on function public.simplified_transfers(uuid) from authenticated;
