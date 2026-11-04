-- Delete (archive) a group.
--
-- Only the owner can delete. Deleting sets groups.archived_at rather than removing rows,
-- so a mistaken delete can be recovered by support. Once archived, the group is hidden
-- from every member and rejects new expenses, payments and invites.

-- An archived group no longer counts as one you're a member of. Every read policy and
-- write function goes through is_group_member, so this one change hides the group's
-- data and blocks writes everywhere.
create or replace function public.is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.group_members m
    join public.groups g on g.id = m.group_id
    where m.group_id = p_group_id
      and m.user_id = (select auth.uid())
      and m.left_at is null
      and g.archived_at is null
  );
$$;

-- Invites to a deleted group must not work.
create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  inv public.group_invites;
begin
  select i.* into inv
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  where i.token = p_token and i.expires_at > now() and g.archived_at is null
  for update of i;
  if inv.id is null then
    raise exception 'This invite link is invalid or has expired' using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (inv.group_id, uid, 'member')
  on conflict (group_id, user_id) do update set left_at = null;

  update public.group_invites set accepted_at = coalesce(accepted_at, now()), accepted_by = coalesce(accepted_by, uid)
  where id = inv.id;

  return inv.group_id;
end $$;

create function public.delete_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
begin
  if not exists (
    select 1
    from public.group_members m
    join public.groups g on g.id = m.group_id
    where m.group_id = p_group_id and m.user_id = uid and m.role = 'owner'
      and m.left_at is null and g.archived_at is null
  ) then
    raise exception 'Only the group owner can delete this group' using errcode = '42501';
  end if;

  update public.groups set archived_at = now() where id = p_group_id;
end $$;

revoke execute on function public.delete_group(uuid) from public, anon;
grant execute on function public.delete_group(uuid) to authenticated;
