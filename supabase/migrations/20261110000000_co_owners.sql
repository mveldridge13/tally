-- Co-owners.
--
-- The owner can make any member with an account a co-owner (stored as role 'admin').
-- A co-owner sees everything in the group, exactly like the owner: every expense and payment,
-- every balance and the full breakdown, and can send settle-up reminders.
-- Only the owner can delete the group, remove people, hand over ownership, or choose co-owners.
-- Leaving or being removed already resets the role to 'member', so access ends with membership.

-- "Sees everything" now means owner or co-owner. Every read rule, my_group_summaries'
-- callers, group_balances, remind_to_settle and group_reminders go through this check.
-- Owner-only actions (remove_member, transfer_ownership, delete_group) check role = 'owner'
-- directly and are unchanged.
create or replace function public.is_group_owner(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.group_members m
    join public.groups g on g.id = m.group_id
    where m.group_id = p_group_id
      and m.user_id = (select auth.uid())
      and m.left_at is null
      and m.role in ('owner', 'admin')
      and g.archived_at is null
  );
$$;

-- Same as before, except co-owners get the full picture too.
create or replace function public.my_group_summaries() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  g record;
  sees_all boolean;
  result jsonb := '[]'::jsonb;
begin
  for g in
    select m.group_id, m.role
    from public.group_members m
    join public.groups gr on gr.id = m.group_id
    where m.user_id = uid and m.left_at is null and gr.archived_at is null
  loop
    sees_all := g.role in ('owner', 'admin');
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
        where sees_all or m.user_id = uid
      ),
      'transfers', (
        select coalesce(jsonb_agg(jsonb_build_object('from_user_id', t.from_user_id,
                 'to_user_id', t.to_user_id, 'amount_cents', t.amount_cents)), '[]'::jsonb)
        from public.simplified_transfers(g.group_id) t
        where sees_all or uid in (t.from_user_id, t.to_user_id)
      )
    ));
  end loop;
  return result;
end $$;

-- The owner makes a member a co-owner, or turns a co-owner back into a member.
create function public.set_co_owner(p_group_id uuid, p_user_id uuid, p_co_owner boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_target_role public.group_role := public.group_role_of(p_group_id, p_user_id);
begin
  if public.group_role_of(p_group_id, uid) is distinct from 'owner' then
    raise exception 'Only the group owner can choose co-owners' using errcode = '42501';
  end if;
  if p_user_id = uid then
    raise exception 'You’re already the owner' using errcode = '22023';
  end if;
  if v_target_role is null then
    raise exception 'That person is not in this group' using errcode = 'P0002';
  end if;
  if p_co_owner and exists (select 1 from public.profiles where id = p_user_id and is_guest) then
    raise exception 'A guest can’t be a co-owner until they join Tally' using errcode = '22023';
  end if;

  update public.group_members
  set role = case when p_co_owner then 'admin'::public.group_role else 'member'::public.group_role end
  where group_id = p_group_id and user_id = p_user_id and left_at is null;
end $$;

-- Reminders: same rules, with the message mentioning co-owners.
create or replace function public.remind_to_settle(p_group_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  owed bigint;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Only the group owner or a co-owner can send reminders' using errcode = '42501';
  end if;
  if p_user_id = uid or not public.is_member_of(p_group_id, p_user_id) then
    raise exception 'That person isn''t in this group' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = p_user_id and is_guest) then
    raise exception 'Guests don''t have the app, so they can''t get reminders' using errcode = '22023';
  end if;

  owed := -public.member_net_balance(p_group_id, p_user_id);
  if owed <= 0 then
    raise exception 'They don''t owe anything right now' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.notifications
    where kind = 'settle_reminder' and group_id = p_group_id and user_id = p_user_id
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'Already reminded in the last day. Try again tomorrow' using errcode = '23505';
  end if;

  insert into public.notifications (user_id, kind, group_id, actor_id, amount_cents)
  values (p_user_id, 'settle_reminder', p_group_id, uid, owed);
end $$;

revoke execute on function public.set_co_owner(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_co_owner(uuid, uuid, boolean) to authenticated;
