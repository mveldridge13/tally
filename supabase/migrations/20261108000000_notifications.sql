-- In-app notifications, shown under the bell on Home.
--
-- For now there is one kind: someone else added you to a group (e.g. from "People you split
-- with"). Joining a group yourself, through an invite or by creating it, doesn't notify you.
-- Rows are written only by the trigger below; people can read and mark their own as read.

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('added_to_group')),
  group_id    uuid references public.groups (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index notifications_user_created on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "read own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- When someone other than you puts you in a group (a new row, or rejoining after leaving).
create function public.notify_added_to_group() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or actor = new.user_id or new.left_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.left_at is null then
    return new; -- was already in the group
  end if;
  -- Guests are placeholders, not accounts: nobody to tell.
  if exists (select 1 from public.profiles where id = new.user_id and is_guest) then
    return new;
  end if;
  insert into public.notifications (user_id, kind, group_id, actor_id)
  values (new.user_id, 'added_to_group', new.group_id, actor);
  return new;
end $$;

create trigger notify_added_to_group
  after insert or update of left_at on public.group_members
  for each row execute function public.notify_added_to_group();

-- Your notifications, newest first, with names filled in. Only groups you're still in and
-- that still exist.
create function public.my_notifications() returns table (
  id uuid, kind text, group_id uuid, group_name text, group_icon text,
  actor_name text, created_at timestamptz, read_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.kind, n.group_id, g.name, g.icon, a.name, n.created_at, n.read_at
  from public.notifications n
  join public.groups g on g.id = n.group_id and g.archived_at is null
  left join public.profiles a on a.id = n.actor_id
  where n.user_id = (select auth.uid())
    and public.is_member_of(n.group_id, n.user_id)
  order by n.created_at desc
  limit 50;
$$;

-- Mark everything you've seen as read (opening the notifications screen).
create function public.mark_notifications_read() returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null;
$$;

revoke execute on function public.notify_added_to_group() from public, anon, authenticated;
revoke execute on function public.my_notifications(), public.mark_notifications_read() from public, anon;
grant execute on function public.my_notifications(), public.mark_notifications_read() to authenticated;
