-- Recurring expenses, on time and in the user's time zone.
--
-- 1. A recurring expense that's due when it's set up, edited or resumed is added straight away,
--    instead of waiting for the hourly job.
-- 2. The hourly job stays, for dates that arrive on their own.
-- 3. "Today" is worked out in the time zone of whoever set it up (taken from their phone and kept
--    up to date by the app), so a period is added just after their midnight, not UTC's.

-- ─── Each person's time zone ─────────────────────────────────────────────────

alter table public.profiles add column time_zone text;

-- The app sends the phone's time zone (e.g. "Australia/Sydney") when it opens.
create function public.set_my_time_zone(p_time_zone text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
begin
  begin
    perform now() at time zone p_time_zone;
  exception when others then
    raise exception 'Unknown time zone' using errcode = '22023';
  end;
  update public.profiles set time_zone = p_time_zone where id = uid and time_zone is distinct from p_time_zone;
end $$;

-- Today's date where this person is (UTC when we don't know yet).
create function public.recurring_today(p_user_id uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select time_zone from public.profiles where id = p_user_id), 'UTC'))::date;
$$;

-- ─── The job, in each person's time zone, and able to run for one schedule ──

drop function public.run_recurring();

create function public.run_recurring(p_only uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r public.recurring_expenses;
  v_expense uuid;
  v_done integer := 0;
  v_loops integer;
  v_stop boolean;
  v_today date;
begin
  for r in
    select x.* from public.recurring_expenses x
    join public.groups g on g.id = x.group_id and g.archived_at is null
    where ((x.stopped_at is null and not x.paused) or (x.due_date is not null and not x.due_reminded))
      and (p_only is null or x.id = p_only)
  loop
    begin
      -- "Today" where the person who set it up is.
      v_today := public.recurring_today(r.created_by);
      -- Heads-up before the next one.
      if r.stopped_at is null and not r.paused and r.heads_up_days > 0 and r.heads_up_for is distinct from r.next_date
         and r.next_date > v_today and r.next_date - r.heads_up_days <= v_today then
        insert into public.notifications (user_id, kind, group_id, actor_id, amount_cents, recurring_id)
        select u, 'recurring_heads_up', r.group_id, r.created_by, r.amount_cents, r.id from public.recurring_audience(r) u;
        update public.recurring_expenses set heads_up_for = r.next_date where id = r.id;
      end if;

      -- Everything due by today (catching up at most a year of weekly ones).
      v_loops := 0;
      v_stop := r.stopped_at is not null or r.paused;
      while r.next_date <= v_today and v_loops < 53 and not v_stop loop
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
      if r.variable and r.due_date is not null and not r.due_reminded and r.due_date + 3 <= v_today then
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

-- Resuming skips dates that passed, in the same time zone.
create or replace function public.set_recurring_paused(p_id uuid, p_paused boolean) returns void
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
    while public.recurring_date(r.start_date, r.frequency, n) < public.recurring_today(r.created_by) loop
      n := n + 1;
    end loop;
  end if;
  update public.recurring_expenses
  set paused = p_paused, occurrences = n, next_date = public.recurring_date(r.start_date, r.frequency, n),
      heads_up_for = null, updated_at = now()
  where id = p_id;
end $$;

-- ─── Add it straight away when it's due ──────────────────────────────────────

create function public.run_recurring_if_due() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.stopped_at is null and not new.paused and new.next_date <= public.recurring_today(new.created_by) then
    perform public.run_recurring(new.id);
  end if;
  return null;
end $$;

create trigger run_recurring_if_due
  after insert or update of next_date, paused, frequency, start_date on public.recurring_expenses
  for each row execute function public.run_recurring_if_due();

revoke execute on function public.run_recurring(uuid), public.run_recurring_if_due(), public.recurring_today(uuid)
  from public, anon, authenticated;
grant execute on function public.run_recurring(uuid) to service_role;
revoke execute on function public.set_my_time_zone(text) from public, anon;
grant execute on function public.set_my_time_zone(text) to authenticated;
