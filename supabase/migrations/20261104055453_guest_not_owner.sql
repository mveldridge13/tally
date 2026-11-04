-- A guest has no login, so a guest can never become a group's owner.
create or replace function public.transfer_ownership(p_group_id uuid, p_new_owner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
begin
  if public.group_role_of(p_group_id, uid) is distinct from 'owner' then
    raise exception 'Only the group owner can transfer ownership' using errcode = '42501';
  end if;
  if p_new_owner_id = uid then
    raise exception 'You are already the owner' using errcode = '22023';
  end if;
  if public.group_role_of(p_group_id, p_new_owner_id) is null then
    raise exception 'That person is not in this group' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles where id = p_new_owner_id and is_guest) then
    raise exception 'A guest can’t be the owner until they join Tally' using errcode = '22023';
  end if;

  update public.group_members set role = 'member' where group_id = p_group_id and user_id = uid;
  update public.group_members set role = 'owner' where group_id = p_group_id and user_id = p_new_owner_id;
end $$;
