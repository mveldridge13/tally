-- Two more notifications under the bell:
--   removed_from_group: "Maria removed you from Flat". Sent when someone else ends your
--     membership (the owner removing you); leaving yourself doesn't notify you.
--   group_settled: "Flat is all settled up · Everyone's square". Sent to everyone in the group
--     with an account, except whoever recorded the payment, when a payment brings every
--     balance in the group to zero.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('added_to_group', 'settle_reminder', 'made_co_owner', 'removed_co_owner',
                  'removed_from_group', 'group_settled'));

-- ─── Removed from a group ────────────────────────────────────────────────────

create function public.notify_removed_from_group() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or actor = new.user_id or old.left_at is not null or new.left_at is null then
    return new; -- leaving yourself, or wasn't a member anyway
  end if;
  if exists (select 1 from public.profiles where id = new.user_id and is_guest) then
    return new; -- guests have no account to tell
  end if;
  insert into public.notifications (user_id, kind, group_id, actor_id)
  values (new.user_id, 'removed_from_group', new.group_id, actor);
  return new;
end $$;

create trigger notify_removed_from_group
  after update of left_at on public.group_members
  for each row execute function public.notify_removed_from_group();

-- ─── Group all settled up ────────────────────────────────────────────────────

-- Runs at the end of the transaction (deferred), after a correction has voided the payment it
-- replaces, so the balances it sees are final. A correction inserts one payment; the check
-- against now() (the transaction's start time) also stops a second notice in the same go.
create function public.notify_group_settled() returns trigger
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
  -- Something was spent, and nobody owes or is owed anything.
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
    and m.user_id is distinct from actor;
  return null;
end $$;

create constraint trigger notify_group_settled
  after insert on public.settlements
  deferrable initially deferred
  for each row execute function public.notify_group_settled();

-- ─── The list under the bell ─────────────────────────────────────────────────

-- Your notifications are your history: they stay after you leave or are removed from a group
-- (before, they disappeared with your membership). Only a deleted group's are dropped.
create or replace function public.my_notifications() returns table (
  id uuid, kind text, group_id uuid, group_name text, group_icon text, group_currency text,
  actor_name text, amount_cents bigint, created_at timestamptz, read_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.kind, n.group_id, g.name, g.icon, g.currency, a.name, n.amount_cents, n.created_at, n.read_at
  from public.notifications n
  join public.groups g on g.id = n.group_id and g.archived_at is null
  left join public.profiles a on a.id = n.actor_id
  where n.user_id = (select auth.uid())
  order by n.created_at desc
  limit 50;
$$;

revoke execute on function public.notify_removed_from_group(), public.notify_group_settled() from public, anon, authenticated;
