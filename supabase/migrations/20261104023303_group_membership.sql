-- Leaving a group, removing a member, and transferring ownership.
--
-- Rules:
--   * A member can only leave, or be removed, once their balance in the group is zero,
--     so nobody disappears while owing or being owed money.
--   * The owner cannot leave; they must transfer ownership first (or delete the group).
--   * Only the owner can remove members or transfer ownership.
-- Leaving sets group_members.left_at; the row and all history stay, and accepting a new
-- invite clears left_at again.

-- Net balance of one member in one group (positive = owed, negative = owes).
-- Internal helper: no access check, so it is not executable by clients.
create function public.member_net_balance(p_group_id uuid, p_user_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(delta), 0)::bigint from (
    select e.amount_cents as delta from public.expenses e
      where e.group_id = p_group_id and e.deleted_at is null and e.payer_id = p_user_id
    union all
    select -s.amount_cents from public.expense_splits s join public.expenses e on e.id = s.expense_id
      where e.group_id = p_group_id and e.deleted_at is null and s.user_id = p_user_id
    union all
    select st.amount_cents from public.settlements st
      where st.group_id = p_group_id and st.status = 'recorded' and st.from_user_id = p_user_id
    union all
    select -st.amount_cents from public.settlements st
      where st.group_id = p_group_id and st.status = 'recorded' and st.to_user_id = p_user_id
  ) ledger;
$$;

create function public.group_role_of(p_group_id uuid, p_user_id uuid) returns public.group_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.group_members m
  join public.groups g on g.id = m.group_id
  where m.group_id = p_group_id and m.user_id = p_user_id and m.left_at is null and g.archived_at is null;
$$;

create function public.leave_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_role public.group_role := public.group_role_of(p_group_id, uid);
  v_balance bigint;
begin
  if v_role is null then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  if v_role = 'owner' then
    raise exception 'Make someone else the owner before leaving, or delete the group' using errcode = '42501';
  end if;
  v_balance := public.member_net_balance(p_group_id, uid);
  if v_balance <> 0 then
    raise exception 'Settle up before leaving: your balance in this group is not zero' using errcode = '23514';
  end if;

  update public.group_members set left_at = now(), role = 'member'
  where group_id = p_group_id and user_id = uid;
end $$;

create function public.remove_member(p_group_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_target_role public.group_role := public.group_role_of(p_group_id, p_user_id);
begin
  if public.group_role_of(p_group_id, uid) is distinct from 'owner' then
    raise exception 'Only the group owner can remove members' using errcode = '42501';
  end if;
  if p_user_id = uid then
    raise exception 'You can’t remove yourself. Make someone else the owner, then leave' using errcode = '22023';
  end if;
  if v_target_role is null then
    raise exception 'That person is not in this group' using errcode = 'P0002';
  end if;
  if public.member_net_balance(p_group_id, p_user_id) <> 0 then
    raise exception 'They need to settle up before they can be removed' using errcode = '23514';
  end if;

  update public.group_members set left_at = now(), role = 'member'
  where group_id = p_group_id and user_id = p_user_id;
end $$;

create function public.transfer_ownership(p_group_id uuid, p_new_owner_id uuid) returns void
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

  update public.group_members set role = 'member' where group_id = p_group_id and user_id = uid;
  update public.group_members set role = 'owner' where group_id = p_group_id and user_id = p_new_owner_id;
end $$;

-- A group must always have exactly one active owner.
create unique index group_members_one_owner on public.group_members (group_id)
  where role = 'owner' and left_at is null;

revoke execute on function
  public.member_net_balance(uuid, uuid),
  public.group_role_of(uuid, uuid),
  public.leave_group(uuid),
  public.remove_member(uuid, uuid),
  public.transfer_ownership(uuid, uuid)
from public, anon;
grant execute on function
  public.leave_group(uuid),
  public.remove_member(uuid, uuid),
  public.transfer_ownership(uuid, uuid)
to authenticated;
