-- Payment confirmation.
--
-- A payment counts towards balances only once the person who RECEIVED the money agrees it
-- happened:
--   * recorded by the receiver ("Sam paid me")            → counts straight away ('recorded')
--   * recorded to a guest (no account, nobody to confirm) → counts straight away ('recorded')
--   * recorded by anyone else ("I paid Leo")              → 'pending' until Leo confirms
-- The receiver confirms (→ 'recorded') or says "Not received" (→ 'declined', the payment is
-- dropped and the payer is told). A pending payment never confirms itself; the payer can cancel
-- it (→ 'voided') or remind the receiver, once a day.
--
-- Every balance (group_balances, member_net_balance, my_group_summaries) already counts only
-- 'recorded' payments, so pending and declined ones are left out without changing them.
--
-- New enum values can't be used in the same transaction that adds them, so the functions below
-- compare status as text and only cast when they run (in later transactions).

alter type public.settlement_status add value if not exists 'pending';
alter type public.settlement_status add value if not exists 'declined';

-- When the receiver answered (confirmed or declined).
alter table public.settlements add column responded_at timestamptz;

-- Notifications about a payment point at it, so they can show its current state and the buttons.
alter table public.notifications add column settlement_id uuid references public.settlements (id) on delete cascade;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('added_to_group', 'settle_reminder', 'made_co_owner', 'removed_co_owner',
                  'removed_from_group', 'group_settled',
                  'payment_to_confirm', 'payment_confirmed', 'payment_declined', 'confirm_reminder'));

create index notifications_settlement on public.notifications (settlement_id) where settlement_id is not null;

-- ─── Recording a payment ─────────────────────────────────────────────────────

-- Same signature as before, so older app versions keep working; it now decides whether the
-- payment counts straight away or waits for the receiver.
create or replace function public.record_settlement(
  p_group_id uuid,
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_amount_cents bigint,
  p_occurred_at timestamptz default now(),
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_id uuid;
  v_status text;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  if not public.is_member_of(p_group_id, p_from_user_id) or not public.is_member_of(p_group_id, p_to_user_id) then
    raise exception 'Both people must be members of the group' using errcode = '22023';
  end if;

  if uid = p_to_user_id or exists (select 1 from public.profiles where id = p_to_user_id and is_guest) then
    v_status := 'recorded';
  else
    v_status := 'pending';
  end if;

  insert into public.settlements (group_id, from_user_id, to_user_id, amount_cents, occurred_at, note, created_by, status)
  values (p_group_id, p_from_user_id, p_to_user_id, p_amount_cents, p_occurred_at, p_note, uid, v_status::public.settlement_status)
  returning id into v_id;

  if v_status = 'pending' then
    insert into public.notifications (user_id, kind, group_id, actor_id, amount_cents, settlement_id)
    values (p_to_user_id, 'payment_to_confirm', p_group_id, uid, p_amount_cents, v_id);
  end if;
  return v_id;
end $$;

-- Correcting a payment follows the same rule: a new amount from anyone but the receiver waits
-- for the receiver to confirm it. The payment it replaces is voided either way.
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
  v_status text;
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

  if uid = old.to_user_id or exists (select 1 from public.profiles where id = old.to_user_id and is_guest) then
    v_status := 'recorded';
  else
    v_status := 'pending';
  end if;

  update public.settlements set status = 'voided' where id = old.id;

  insert into public.settlements (group_id, from_user_id, to_user_id, amount_cents, occurred_at, note, created_by, replaces_id, status)
  values (old.group_id, old.from_user_id, old.to_user_id, p_amount_cents, coalesce(p_occurred_at, old.occurred_at), p_note, uid, old.id,
          v_status::public.settlement_status)
  returning id into v_id;

  if v_status = 'pending' then
    insert into public.notifications (user_id, kind, group_id, actor_id, amount_cents, settlement_id)
    values (old.to_user_id, 'payment_to_confirm', old.group_id, uid, p_amount_cents, v_id);
  end if;
  return v_id;
end $$;

-- ─── The receiver answers ────────────────────────────────────────────────────

create function public.respond_to_payment(p_settlement_id uuid, p_received boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  s public.settlements;
begin
  select * into s from public.settlements where id = p_settlement_id for update;
  if s.id is null or s.to_user_id <> uid or not public.is_group_member(s.group_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if s.status::text <> 'pending' then
    raise exception 'This payment has already been answered or cancelled' using errcode = '22023';
  end if;

  update public.settlements
  set status = (case when p_received then 'recorded' else 'declined' end)::public.settlement_status,
      responded_at = now()
  where id = s.id;

  -- Tell whoever recorded it.
  if s.created_by <> uid then
    insert into public.notifications (user_id, kind, group_id, actor_id, amount_cents, settlement_id)
    values (s.created_by, case when p_received then 'payment_confirmed' else 'payment_declined' end,
            s.group_id, uid, s.amount_cents, s.id);
  end if;
end $$;

-- ─── The payer cancels or reminds ────────────────────────────────────────────

-- Undo now also cancels a pending payment.
create or replace function public.void_settlement(p_settlement_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  old public.settlements;
begin
  perform public.require_user();
  select * into old from public.settlements
  where id = p_settlement_id and status::text in ('recorded', 'pending') for update;
  if old.id is null or not public.can_see_settlement(old.group_id, old.from_user_id, old.to_user_id, old.created_by) then
    raise exception 'Settlement not found' using errcode = 'P0002';
  end if;
  update public.settlements set status = 'voided' where id = p_settlement_id;
end $$;

create function public.remind_to_confirm(p_settlement_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  s public.settlements;
begin
  select * into s from public.settlements where id = p_settlement_id;
  if s.id is null or s.created_by <> uid or not public.is_group_member(s.group_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if s.status::text <> 'pending' then
    raise exception 'This payment isn''t waiting for anyone' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.notifications
    where settlement_id = s.id and kind in ('payment_to_confirm', 'confirm_reminder')
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'They were asked in the last day. Try again tomorrow' using errcode = '23505';
  end if;
  insert into public.notifications (user_id, kind, group_id, actor_id, amount_cents, settlement_id)
  values (s.to_user_id, 'confirm_reminder', s.group_id, uid, s.amount_cents, s.id);
end $$;

-- ─── Waiting for you ─────────────────────────────────────────────────────────

-- Payments someone says they made to you that you haven't answered yet. Members can't read
-- payments other people recorded (member privacy), so the receiver gets them through here.
create function public.payments_to_confirm() returns table (
  id uuid, group_id uuid, group_name text, group_icon text, group_currency text,
  from_user_id uuid, from_name text, amount_cents bigint, occurred_at timestamptz, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
  select s.id, s.group_id, g.name, g.icon, g.currency, s.from_user_id, p.name, s.amount_cents, s.occurred_at, s.created_at
  from public.settlements s
  join public.groups g on g.id = s.group_id and g.archived_at is null
  join public.profiles p on p.id = s.from_user_id
  where s.to_user_id = (select auth.uid())
    and s.status::text = 'pending'
    and public.is_group_member(s.group_id)
  order by s.created_at desc;
end $$;

-- ─── Group all settled, on confirmation too ──────────────────────────────────

-- A confirmation can be what squares a group, so the "all settled" check also runs when a
-- payment becomes 'recorded' (the function itself ignores every other status).
create constraint trigger notify_group_settled_on_confirm
  after update of status on public.settlements
  deferrable initially deferred
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_group_settled();

-- Who hears that the group is settled: everyone with an account except whoever squared it.
-- With confirmation that's two people, both of whom already know: the person confirming the
-- payment (the receiver) and the person who recorded it (the payer).
create or replace function public.notify_group_settled() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
begin
  if new.status <> 'recorded' then
    return null;
  end if;
  if exists (
    select 1 from public.notifications
    where kind = 'group_settled' and group_id = new.group_id and created_at = now()
  ) then
    return null;
  end if;
  if not exists (select 1 from public.expenses e where e.group_id = new.group_id and e.deleted_at is null) then
    return null;
  end if;
  if exists (
    select 1 from (select distinct user_id from public.group_members where group_id = new.group_id) m
    where public.member_net_balance(new.group_id, m.user_id) <> 0
  ) then
    return null;
  end if;

  insert into public.notifications (user_id, kind, group_id, actor_id)
  select m.user_id, 'group_settled', new.group_id, actor
  from public.group_members m
  join public.profiles p on p.id = m.user_id and not p.is_guest
  where m.group_id = new.group_id and m.left_at is null
    and m.user_id is distinct from actor
    and m.user_id is distinct from new.created_by;
  return null;
end $$;

revoke execute on function public.notify_group_settled() from public, anon, authenticated;

-- ─── Notifications list, with the payment's current state ────────────────────

drop function public.my_notifications();
create function public.my_notifications() returns table (
  id uuid, kind text, group_id uuid, group_name text, group_icon text, group_currency text,
  actor_name text, amount_cents bigint, created_at timestamptz, read_at timestamptz,
  settlement_id uuid, settlement_status text
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.kind, n.group_id, g.name, g.icon, g.currency, a.name, n.amount_cents, n.created_at, n.read_at,
         n.settlement_id, s.status::text
  from public.notifications n
  join public.groups g on g.id = n.group_id and g.archived_at is null
  left join public.profiles a on a.id = n.actor_id
  left join public.settlements s on s.id = n.settlement_id
  where n.user_id = (select auth.uid())
  order by n.created_at desc
  limit 50;
$$;

revoke execute on function
  public.respond_to_payment(uuid, boolean),
  public.remind_to_confirm(uuid),
  public.payments_to_confirm(),
  public.my_notifications()
from public, anon;
grant execute on function
  public.respond_to_payment(uuid, boolean),
  public.remind_to_confirm(uuid),
  public.payments_to_confirm(),
  public.my_notifications()
to authenticated;
