-- Settle-up reminders: the owner of a group can nudge a member who owes money.
--
-- The reminder arrives under the member's bell: "Maria reminded you to settle up in Flat ·
-- You owe $42.00". One reminder per person per group every 24 hours, so it never turns into
-- nagging. Guests have no account, so they can't be reminded.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('added_to_group', 'settle_reminder'));

-- What they owed when reminded (positive cents, in the group's currency).
alter table public.notifications add column amount_cents bigint;

create index notifications_reminders on public.notifications (group_id, user_id, created_at desc)
  where kind = 'settle_reminder';

create function public.remind_to_settle(p_group_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  owed bigint;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Only the group owner can send reminders' using errcode = '42501';
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

-- For the owner: when each member was last reminded in this group (to show "Reminded").
create function public.group_reminders(p_group_id uuid)
returns table (user_id uuid, last_reminded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select n.user_id, max(n.created_at)
  from public.notifications n
  where n.kind = 'settle_reminder' and n.group_id = p_group_id
    and public.is_group_owner(p_group_id)
  group by n.user_id;
$$;

-- my_notifications gains the amount and the group's currency.
drop function public.my_notifications();
create function public.my_notifications() returns table (
  id uuid, kind text, group_id uuid, group_name text, group_icon text, group_currency text,
  actor_name text, amount_cents bigint, created_at timestamptz, read_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.kind, n.group_id, g.name, g.icon, g.currency, a.name, n.amount_cents, n.created_at, n.read_at
  from public.notifications n
  join public.groups g on g.id = n.group_id and g.archived_at is null
  left join public.profiles a on a.id = n.actor_id
  where n.user_id = (select auth.uid())
    and public.is_member_of(n.group_id, n.user_id)
  order by n.created_at desc
  limit 50;
$$;

revoke execute on function public.remind_to_settle(uuid, uuid), public.group_reminders(uuid), public.my_notifications() from public, anon;
grant execute on function public.remind_to_settle(uuid, uuid), public.group_reminders(uuid), public.my_notifications() to authenticated;
