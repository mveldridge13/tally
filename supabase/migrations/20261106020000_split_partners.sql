-- "People you split with": add someone you already share a group with, without an invite.
--
-- A split partner is a real (non-guest) user who is, or was, in any group with you.
-- Because they have already joined a group alongside you, any member of a group can add
-- them straight to it. Strangers still need an invite: knowing someone's email or id is
-- never enough to add them.

-- Everyone you split with, most recent first, with how many groups you have shared.
create function public.split_partners()
returns table (user_id uuid, name text, shared_groups integer, last_shared_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, count(distinct me.group_id)::integer, max(greatest(me.joined_at, them.joined_at))
  from public.group_members me
  join public.group_members them on them.group_id = me.group_id and them.user_id <> me.user_id
  join public.profiles p on p.id = them.user_id and not p.is_guest
  where me.user_id = (select auth.uid())
  group by p.id, p.name
  order by max(greatest(me.joined_at, them.joined_at)) desc, p.name;
$$;

-- Add split partners to a group in one go. All or nothing: if anyone can't be added,
-- nobody is.
create function public.add_members(p_group_id uuid, p_user_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_user uuid;
begin
  if public.group_role_of(p_group_id, uid) is null then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_user_ids), 0) = 0 then
    raise exception 'Pick at least one person to add' using errcode = '22023';
  end if;

  for v_user in select distinct u from unnest(p_user_ids) u loop
    if not exists (select 1 from public.split_partners() sp where sp.user_id = v_user) then
      raise exception 'You can only add people you already split with. Send others an invite' using errcode = '42501';
    end if;
    if public.is_member_of(p_group_id, v_user) then
      raise exception '% is already in this group', (select name from public.profiles where id = v_user) using errcode = '23505';
    end if;

    -- Someone who left earlier rejoins with their old history.
    insert into public.group_members (group_id, user_id, role)
    values (p_group_id, v_user, 'member')
    on conflict (group_id, user_id) do update set left_at = null;
  end loop;
end $$;

revoke execute on function public.split_partners(), public.add_members(uuid, uuid[]) from public, anon;
grant execute on function public.split_partners(), public.add_members(uuid, uuid[]) to authenticated;
