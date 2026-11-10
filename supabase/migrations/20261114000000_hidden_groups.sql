-- "Done with this group": each person can put a group away so it leaves their own Groups list.
-- It's private to them (nobody else can see who put a group away) and changes nothing else:
-- balances, Home's To settle and the group itself are untouched. Not groups.archived_at, which
-- is Delete group and hides it for everyone.
-- A put-away group comes back for everyone who put it away as soon as someone adds an expense.

create table public.hidden_groups (
  user_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  group_id  uuid not null references public.groups (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

alter table public.hidden_groups enable row level security;

create policy "read own hidden groups" on public.hidden_groups for select to authenticated
  using (user_id = (select auth.uid()));

create policy "hide groups you're in" on public.hidden_groups for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id));

create policy "unhide own groups" on public.hidden_groups for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.hidden_groups from anon;
grant select, insert, delete on public.hidden_groups to authenticated;

-- A new expense brings the group back for everyone who'd put it away.
create function public.unhide_group_on_expense() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.hidden_groups where group_id = new.group_id;
  return new;
end $$;

create trigger unhide_group_on_expense
  after insert on public.expenses
  for each row execute function public.unhide_group_on_expense();
