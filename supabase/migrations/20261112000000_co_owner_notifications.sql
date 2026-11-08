-- Co-owner notifications: tell a member when the owner makes them a co-owner, or removes
-- them as one, under their bell:
--   "Maria made you a co-owner of Flat · You can now see everything in this group"
--   "Maria removed you as co-owner of Flat · You'll now see only items you added"
-- Sent only when the role actually changes, so tapping twice doesn't notify twice.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('added_to_group', 'settle_reminder', 'made_co_owner', 'removed_co_owner'));

create or replace function public.set_co_owner(p_group_id uuid, p_user_id uuid, p_co_owner boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_target_role public.group_role := public.group_role_of(p_group_id, p_user_id);
  v_new_role public.group_role := case when p_co_owner then 'admin'::public.group_role else 'member'::public.group_role end;
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
  if v_target_role = v_new_role then
    return; -- nothing changes, nobody to tell
  end if;

  update public.group_members set role = v_new_role
  where group_id = p_group_id and user_id = p_user_id and left_at is null;

  insert into public.notifications (user_id, kind, group_id, actor_id)
  values (p_user_id, case when p_co_owner then 'made_co_owner' else 'removed_co_owner' end, p_group_id, uid);
end $$;
