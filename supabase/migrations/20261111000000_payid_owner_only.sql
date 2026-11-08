-- PayIDs: only the group owner's is shared.
--
-- Before, anyone who shared a group with you could read your PayID. Now a PayID is visible to
-- its owner, and to the members of groups that person OWNS: members see the owner's PayID so
-- they can pay them, but nobody (the owner included) sees a regular member's PayID.

-- Is p_user_id the active owner of a group the current user is an active member of?
create function public.owns_group_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.group_members owner_row
    join public.group_members me on me.group_id = owner_row.group_id
    join public.groups g on g.id = owner_row.group_id
    where owner_row.user_id = p_user_id
      and owner_row.role = 'owner'
      and owner_row.left_at is null
      and me.user_id = (select auth.uid())
      and me.left_at is null
      and g.archived_at is null
  );
$$;

revoke execute on function public.owns_group_with(uuid) from public, anon;
-- The policy calls it as the signed-in user.
grant execute on function public.owns_group_with(uuid) to authenticated;

drop policy "read own or co-member payment methods" on public.payment_methods;
create policy "read own or group owner's payment methods" on public.payment_methods for select to authenticated
  using (user_id = (select auth.uid()) or public.owns_group_with(user_id));
