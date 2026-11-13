-- Recurring expenses.
--
-- A schedule ("Rent, $2,400, monthly from 1 Dec") is kept apart from the expenses it creates,
-- so changing a schedule never rewrites history. Each created expense points back to it
-- (expenses.recurring_id) and is an ordinary expense from then on.
--
--   * Fixed amount: on each due date the job adds the expense and tells the people in it.
--   * Amount changes each time (variable): on the due date the schedule is marked due and the
--     usual payer is asked for the amount; one reminder after 3 days if it's still empty.
--   * Heads-up: each schedule chooses same day / 1 / 3 / 7 days before.
--
-- Anyone in the group can set one up. Member privacy applies: owners and co-owners see every
-- schedule, members only the ones they set up (plus a due bill they're the usual payer of).
-- Dates are calendar dates; the job runs hourly and works in UTC.

create table public.recurring_expenses (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups (id) on delete cascade,
  created_by      uuid not null references public.profiles (id),
  description     text not null check (char_length(description) between 1 and 120),
  payer_id        uuid not null references public.profiles (id),
  split_method    public.split_method not null,
  -- The form's split as entered (the app's SplitInput), so the next one opens filled in.
  split_input     jsonb not null,
  variable        boolean not null default false,
  -- Fixed amount only: the amount and the shares worked out by the app, re-checked here.
  amount_cents    bigint check (amount_cents > 0),
  splits          jsonb,
  items           jsonb,
  frequency       text not null check (frequency in ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
  -- Dates come from start_date + n × frequency (so a monthly one on the 31st lands on the 30th
  -- or 28th in short months, and back on the 31st after).
  start_date      date not null,
  occurrences     integer not null default 0,
  next_date       date not null,
  end_date        date,
  -- How many are still to come when it ends after a number of times; null = no limit.
  remaining       integer check (remaining >= 0),
  heads_up_days   integer not null default 1 check (heads_up_days in (0, 1, 3, 7)),
  heads_up_for    date,
  -- Variable only: the due date still waiting for its amount, and whether the payer was reminded.
  due_date        date,
  due_reminded    boolean not null default false,
  paused          boolean not null default false,
  stopped_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((variable and amount_cents is null and splits is null) or (not variable and amount_cents is not null and splits is not null))
);
create index recurring_expenses_group on public.recurring_expenses (group_id);
create index recurring_expenses_next on public.recurring_expenses (next_date) where stopped_at is null and not paused;

alter table public.recurring_expenses enable row level security;
create policy "owner or creator reads recurring" on public.recurring_expenses for select to authenticated
  using (public.can_see_expense(group_id, created_by));

alter table public.expenses add column recurring_id uuid references public.recurring_expenses (id) on delete set null;
create index expenses_recurring on public.expenses (recurring_id) where recurring_id is not null;

-- ─── Notifications ───────────────────────────────────────────────────────────

alter table public.notifications add column recurring_id uuid references public.recurring_expenses (id) on delete cascade;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('added_to_group', 'settle_reminder', 'made_co_owner', 'removed_co_owner',
                  'removed_from_group', 'group_settled',
                  'payment_to_confirm', 'payment_confirmed', 'payment_declined', 'confirm_reminder',
                  'recurring_heads_up', 'recurring_added', 'recurring_due', 'recurring_due_reminder'));

-- ─── Helpers ─────────────────────────────────────────────────────────────────

-- The n-th date of a schedule (n = 0 is the start date).
create function public.recurring_date(p_start date, p_frequency text, p_n integer) returns date
language sql immutable set search_path = '' as $$
  select case p_frequency
    when 'weekly' then p_start + 7 * p_n
    when 'fortnightly' then p_start + 14 * p_n
    when 'monthly' then (p_start + make_interval(months => p_n))::date
    when 'quarterly' then (p_start + make_interval(months => 3 * p_n))::date
    else (p_start + make_interval(years => p_n))::date
  end;
$$;

-- Can the current user change this schedule? Whoever set it up, or the group's owner or a co-owner.
create function public.can_manage_recurring(p_group_id uuid, p_created_by uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_group_owner(p_group_id)
      or (p_created_by = (select auth.uid()) and public.is_group_member(p_group_id));
$$;

-- People to tell about a schedule: the payer and everyone in its split who has an account and is
-- still in the group. Variable schedules have no shares yet, so just the payer and whoever set it up.
create function public.recurring_audience(r public.recurring_expenses) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct u from (
    select r.payer_id as u
    union all select r.created_by where r.variable
    union all select (s ->> 'user_id')::uuid from jsonb_array_elements(coalesce(r.splits, '[]'::jsonb)) s
  ) people
  join public.profiles p on p.id = people.u and not p.is_guest
  where public.is_member_of(r.group_id, people.u);
$$;

create function public.check_recurring_input(
  p_group_id uuid, p_payer_id uuid, p_split_method public.split_method, p_variable boolean,
  p_amount_cents bigint, p_splits jsonb, p_items jsonb, p_frequency text, p_heads_up_days integer
) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member_of(p_group_id, p_payer_id) then
    raise exception 'The payer must be a member of the group' using errcode = '22023';
  end if;
  if p_frequency not in ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly') then
    raise exception 'Choose how often it recurs' using errcode = '22023';
  end if;
  if p_heads_up_days not in (0, 1, 3, 7) then
    raise exception 'Choose when people hear about it' using errcode = '22023';
  end if;
  if not p_variable then
    if p_amount_cents is null or p_amount_cents <= 0 then
      raise exception 'Enter the amount' using errcode = '22023';
    end if;
    perform public.validate_splits(p_group_id, p_amount_cents, p_splits);
    if p_split_method::text = 'items' then
      perform public.validate_items(p_amount_cents, p_splits, p_items);
    end if;
  end if;
end $$;

-- ─── Setting up and changing a schedule ──────────────────────────────────────

-- p_first_expense_id: when it starts today, the app saves today's expense first and passes it here,
-- so it counts as the first one and the schedule moves on to the next date.
create function public.create_recurring(
  p_group_id uuid,
  p_description text,
  p_payer_id uuid,
  p_split_method public.split_method,
  p_split_input jsonb,
  p_variable boolean,
  p_amount_cents bigint,
  p_splits jsonb,
  p_items jsonb,
  p_frequency text,
  p_start_date date,
  p_end_date date,
  p_remaining integer,
  p_heads_up_days integer,
  p_first_expense_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_id uuid;
  v_first boolean := p_first_expense_id is not null;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  perform public.check_recurring_input(p_group_id, p_payer_id, p_split_method, p_variable,
    p_amount_cents, p_splits, p_items, p_frequency, p_heads_up_days);
  if p_start_date is null or p_start_date < current_date - 1 then
    raise exception 'Start today or later' using errcode = '22023';
  end if;
  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'It has to end after it starts' using errcode = '22023';
  end if;
  if p_remaining is not null and p_remaining < 1 then
    raise exception 'It has to happen at least once' using errcode = '22023';
  end if;
  if v_first and not exists (
    select 1 from public.expenses e
    where e.id = p_first_expense_id and e.group_id = p_group_id and e.created_by = uid and e.deleted_at is null
  ) then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;

  insert into public.recurring_expenses (group_id, created_by, description, payer_id, split_method, split_input,
    variable, amount_cents, splits, items, frequency, start_date, occurrences, next_date, end_date, remaining, heads_up_days)
  values (p_group_id, uid, trim(p_description), p_payer_id, p_split_method, p_split_input,
    p_variable, case when p_variable then null else p_amount_cents end, case when p_variable then null else p_splits end,
    case when p_variable or p_split_method::text <> 'items' then null else p_items end,
    p_frequency, p_start_date, case when v_first then 1 else 0 end,
    public.recurring_date(p_start_date, p_frequency, case when v_first then 1 else 0 end),
    p_end_date, case when p_remaining is null then null when v_first then p_remaining - 1 else p_remaining end, p_heads_up_days)
  returning id into v_id;

  if v_first then
    update public.expenses set recurring_id = v_id where id = p_first_expense_id;
    -- Only once: nothing more to come.
    update public.recurring_expenses set stopped_at = now()
    where id = v_id and (remaining = 0 or (end_date is not null and next_date > end_date));
  end if;
  return v_id;
end $$;

-- Change what future ones will be. Expenses already added stay as they are. A new frequency
-- starts counting from the next date.
create function public.update_recurring(
  p_id uuid,
  p_description text,
  p_payer_id uuid,
  p_split_method public.split_method,
  p_split_input jsonb,
  p_variable boolean,
  p_amount_cents bigint,
  p_splits jsonb,
  p_items jsonb,
  p_frequency text,
  p_end_date date,
  p_remaining integer,
  p_heads_up_days integer
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.recurring_expenses;
begin
  perform public.require_user();
  select * into r from public.recurring_expenses where id = p_id for update;
  if r.id is null or r.stopped_at is not null or not public.can_manage_recurring(r.group_id, r.created_by) then
    raise exception 'Recurring expense not found' using errcode = 'P0002';
  end if;
  perform public.check_recurring_input(r.group_id, p_payer_id, p_split_method, p_variable,
    p_amount_cents, p_splits, p_items, p_frequency, p_heads_up_days);
  if p_end_date is not null and p_end_date < r.next_date then
    raise exception 'It has to end on or after the next date' using errcode = '22023';
  end if;

  update public.recurring_expenses set
    description = trim(p_description), payer_id = p_payer_id, split_method = p_split_method, split_input = p_split_input,
    variable = p_variable,
    amount_cents = case when p_variable then null else p_amount_cents end,
    splits = case when p_variable then null else p_splits end,
    items = case when p_variable or p_split_method::text <> 'items' then null else p_items end,
    start_date = case when p_frequency <> r.frequency then r.next_date else r.start_date end,
    occurrences = case when p_frequency <> r.frequency then 0 else r.occurrences end,
    frequency = p_frequency,
    end_date = p_end_date, remaining = p_remaining, heads_up_days = p_heads_up_days,
    heads_up_for = null,
    updated_at = now()
  where id = p_id;
end $$;

-- Pause or resume. Resuming skips any dates that passed while it was paused.
create function public.set_recurring_paused(p_id uuid, p_paused boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.recurring_expenses;
  n integer;
begin
  perform public.require_user();
  select * into r from public.recurring_expenses where id = p_id for update;
  if r.id is null or r.stopped_at is not null or not public.can_manage_recurring(r.group_id, r.created_by) then
    raise exception 'Recurring expense not found' using errcode = 'P0002';
  end if;
  n := r.occurrences;
  if not p_paused then
    while public.recurring_date(r.start_date, r.frequency, n) < current_date loop
      n := n + 1;
    end loop;
  end if;
  update public.recurring_expenses
  set paused = p_paused, occurrences = n, next_date = public.recurring_date(r.start_date, r.frequency, n),
      heads_up_for = null, updated_at = now()
  where id = p_id;
end $$;

create function public.stop_recurring(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.recurring_expenses;
begin
  perform public.require_user();
  select * into r from public.recurring_expenses where id = p_id for update;
  if r.id is null or r.stopped_at is not null or not public.can_manage_recurring(r.group_id, r.created_by) then
    raise exception 'Recurring expense not found' using errcode = 'P0002';
  end if;
  update public.recurring_expenses set stopped_at = now(), due_date = null, updated_at = now() where id = p_id;
end $$;

-- ─── Bills waiting for their amount ──────────────────────────────────────────

-- Variable bills that are due, for whoever can fill them in: the usual payer, whoever set it up,
-- and the group's owner and co-owners.
create function public.recurring_due() returns table (
  id uuid, group_id uuid, description text, payer_id uuid, split_method text, split_input jsonb,
  frequency text, due_date date, next_date date
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.group_id, r.description, r.payer_id, r.split_method::text, r.split_input, r.frequency, r.due_date, r.next_date
  from public.recurring_expenses r
  join public.groups g on g.id = r.group_id and g.archived_at is null
  where r.due_date is not null
    and public.is_group_member(r.group_id)
    and (r.payer_id = (select auth.uid()) or public.can_manage_recurring(r.group_id, r.created_by))
  order by r.due_date;
$$;

-- The amount for a due bill was entered (as a normal expense): link it and clear the due bill.
create function public.complete_recurring_due(p_id uuid, p_expense_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  r public.recurring_expenses;
begin
  select * into r from public.recurring_expenses where id = p_id for update;
  if r.id is null or r.due_date is null
     or not (r.payer_id = uid or public.can_manage_recurring(r.group_id, r.created_by))
     or not exists (select 1 from public.expenses e where e.id = p_expense_id and e.group_id = r.group_id and e.created_by = uid) then
    raise exception 'Nothing is waiting for an amount here' using errcode = 'P0002';
  end if;
  update public.expenses set recurring_id = r.id where id = p_expense_id;
  update public.recurring_expenses set due_date = null, due_reminded = false, updated_at = now() where id = r.id;
end $$;

-- ─── The job ─────────────────────────────────────────────────────────────────

-- Adds what's due, sends heads-ups and reminders. Safe to run as often as you like.
-- A schedule that can't be added (say the payer left the group) is paused, and whoever set it up is told.
create function public.run_recurring() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r public.recurring_expenses;
  v_expense uuid;
  v_done integer := 0;
  v_loops integer;
  v_stop boolean;
begin
  for r in
    select x.* from public.recurring_expenses x
    join public.groups g on g.id = x.group_id and g.archived_at is null
    where (x.stopped_at is null and not x.paused) or (x.due_date is not null and not x.due_reminded)
  loop
    begin
      -- Heads-up before the next one.
      if r.stopped_at is null and not r.paused and r.heads_up_days > 0 and r.heads_up_for is distinct from r.next_date
         and r.next_date > current_date and r.next_date - r.heads_up_days <= current_date then
        insert into public.notifications (user_id, kind, group_id, actor_id, amount_cents, recurring_id)
        select u, 'recurring_heads_up', r.group_id, r.created_by, r.amount_cents, r.id from public.recurring_audience(r) u;
        update public.recurring_expenses set heads_up_for = r.next_date where id = r.id;
      end if;

      -- Everything due by today (catching up at most a year of weekly ones).
      v_loops := 0;
      v_stop := r.stopped_at is not null or r.paused;
      while r.next_date <= current_date and v_loops < 53 and not v_stop loop
        v_loops := v_loops + 1;
        if r.variable then
          r.due_date := coalesce(r.due_date, r.next_date);
          r.due_reminded := false;
          insert into public.notifications (user_id, kind, group_id, actor_id, recurring_id)
          select u, 'recurring_due', r.group_id, r.created_by, r.id from public.recurring_audience(r) u;
        else
          perform public.validate_splits(r.group_id, r.amount_cents, r.splits);
          insert into public.expenses (group_id, description, amount_cents, payer_id, created_by, split_method,
                                       occurred_at, items, recurring_id)
          values (r.group_id, r.description, r.amount_cents, r.payer_id, r.created_by, r.split_method,
                  r.next_date::timestamptz + interval '12 hours', r.items, r.id)
          returning id into v_expense;
          insert into public.expense_splits (expense_id, user_id, amount_cents, weight)
          select v_expense, (s ->> 'user_id')::uuid, (s ->> 'amount_cents')::bigint, (s ->> 'weight')::integer
          from jsonb_array_elements(r.splits) s;
          insert into public.notifications (user_id, kind, group_id, actor_id, amount_cents, recurring_id)
          select u, 'recurring_added', r.group_id, r.created_by, r.amount_cents, r.id from public.recurring_audience(r) u;
        end if;
        v_done := v_done + 1;
        r.occurrences := r.occurrences + 1;
        r.remaining := case when r.remaining is null then null else r.remaining - 1 end;
        r.next_date := public.recurring_date(r.start_date, r.frequency, r.occurrences);
        v_stop := r.remaining = 0 or (r.end_date is not null and r.next_date > r.end_date);
      end loop;

      -- One reminder about a bill still waiting for its amount after 3 days.
      if r.variable and r.due_date is not null and not r.due_reminded and r.due_date + 3 <= current_date then
        insert into public.notifications (user_id, kind, group_id, actor_id, recurring_id)
        values (r.payer_id, 'recurring_due_reminder', r.group_id, r.created_by, r.id);
        r.due_reminded := true;
      end if;

      -- An ended schedule stops; a variable bill already due stays waiting for its amount.
      update public.recurring_expenses set
        occurrences = r.occurrences, remaining = r.remaining, next_date = r.next_date,
        due_date = r.due_date, due_reminded = r.due_reminded,
        stopped_at = case when v_stop and stopped_at is null and not paused then now() else stopped_at end
      where id = r.id;
    exception when others then
      -- Can't be added any more (e.g. someone in it left the group): pause it so it shows in the list.
      update public.recurring_expenses set paused = true, updated_at = now() where id = r.id;
    end;
  end loop;
  return v_done;
end $$;

-- Hourly. Each run only does what's due, so running it more often changes nothing.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('tally-recurring', '5 * * * *', 'select public.run_recurring()');

-- ─── Notifications list, with the schedule's name ────────────────────────────

drop function public.my_notifications();
create function public.my_notifications() returns table (
  id uuid, kind text, group_id uuid, group_name text, group_icon text, group_currency text,
  actor_name text, amount_cents bigint, created_at timestamptz, read_at timestamptz,
  settlement_id uuid, settlement_status text, recurring_id uuid, recurring_description text
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.kind, n.group_id, g.name, g.icon, g.currency, a.name, n.amount_cents, n.created_at, n.read_at,
         n.settlement_id, s.status::text, n.recurring_id, r.description
  from public.notifications n
  join public.groups g on g.id = n.group_id and g.archived_at is null
  left join public.profiles a on a.id = n.actor_id
  left join public.settlements s on s.id = n.settlement_id
  left join public.recurring_expenses r on r.id = n.recurring_id
  where n.user_id = (select auth.uid())
  order by n.created_at desc
  limit 50;
$$;

revoke execute on function
  public.recurring_date(date, text, integer),
  public.can_manage_recurring(uuid, uuid),
  public.recurring_audience(public.recurring_expenses),
  public.check_recurring_input(uuid, uuid, public.split_method, boolean, bigint, jsonb, jsonb, text, integer),
  public.run_recurring()
from public, anon, authenticated;
grant execute on function public.run_recurring() to service_role;

revoke execute on function
  public.create_recurring(uuid, text, uuid, public.split_method, jsonb, boolean, bigint, jsonb, jsonb, text, date, date, integer, integer, uuid),
  public.update_recurring(uuid, text, uuid, public.split_method, jsonb, boolean, bigint, jsonb, jsonb, text, date, integer, integer),
  public.set_recurring_paused(uuid, boolean),
  public.stop_recurring(uuid),
  public.recurring_due(),
  public.complete_recurring_due(uuid, uuid),
  public.my_notifications()
from public, anon;
grant execute on function
  public.create_recurring(uuid, text, uuid, public.split_method, jsonb, boolean, bigint, jsonb, jsonb, text, date, date, integer, integer, uuid),
  public.update_recurring(uuid, text, uuid, public.split_method, jsonb, boolean, bigint, jsonb, jsonb, text, date, integer, integer),
  public.set_recurring_paused(uuid, boolean),
  public.stop_recurring(uuid),
  public.recurring_due(),
  public.complete_recurring_due(uuid, uuid),
  public.my_notifications()
to authenticated;
