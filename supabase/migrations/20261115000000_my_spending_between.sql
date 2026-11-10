-- Home's flip card: your share of each group's expenses in a date range (the app passes this month).
-- Members can't download expenses other people added, so the app can't add this up itself.
-- Returns only your own share, per group you're currently in, and only groups where it's above zero.
create function public.my_spending_between(p_from timestamptz, p_to timestamptz)
returns table (group_id uuid, my_share bigint)
language sql stable security definer set search_path = '' as $$
  select e.group_id, sum(s.amount_cents)::bigint
  from public.expense_splits s
  join public.expenses e on e.id = s.expense_id
  join public.group_members m on m.group_id = e.group_id and m.user_id = (select auth.uid()) and m.left_at is null
  join public.groups g on g.id = e.group_id and g.archived_at is null
  where s.user_id = (select auth.uid())
    and e.deleted_at is null
    and e.occurred_at >= p_from
    and e.occurred_at < p_to
  group by e.group_id
  having sum(s.amount_cents) > 0;
$$;

revoke execute on function public.my_spending_between(timestamptz, timestamptz) from public, anon;
grant execute on function public.my_spending_between(timestamptz, timestamptz) to authenticated;
