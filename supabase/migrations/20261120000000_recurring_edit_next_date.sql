-- Editing a recurring expense can move its next date (e.g. rent moves from the 17th to the 1st).
-- The schedule then counts on from the new date at the same frequency; expenses already added
-- stay as they are. Leaving p_next_date out keeps the current dates (older app versions).

drop function public.update_recurring(uuid, text, uuid, public.split_method, jsonb, boolean, bigint, jsonb, jsonb, text, date, integer, integer);

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
  p_heads_up_days integer,
  p_next_date date default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.recurring_expenses;
  v_restart boolean;
  v_next date;
begin
  perform public.require_user();
  select * into r from public.recurring_expenses where id = p_id for update;
  if r.id is null or r.stopped_at is not null or not public.can_manage_recurring(r.group_id, r.created_by) then
    raise exception 'Recurring expense not found' using errcode = 'P0002';
  end if;
  perform public.check_recurring_input(r.group_id, p_payer_id, p_split_method, p_variable,
    p_amount_cents, p_splits, p_items, p_frequency, p_heads_up_days);
  if p_next_date is not null and p_next_date < current_date - 1 then
    raise exception 'The next one has to be today or later' using errcode = '22023';
  end if;

  -- A new next date or a new frequency starts counting again from the next date.
  v_next := coalesce(p_next_date, r.next_date);
  v_restart := v_next <> r.next_date or p_frequency <> r.frequency;
  if p_end_date is not null and p_end_date < v_next then
    raise exception 'It has to end on or after the next date' using errcode = '22023';
  end if;

  update public.recurring_expenses set
    description = trim(p_description), payer_id = p_payer_id, split_method = p_split_method, split_input = p_split_input,
    variable = p_variable,
    amount_cents = case when p_variable then null else p_amount_cents end,
    splits = case when p_variable then null else p_splits end,
    items = case when p_variable or p_split_method::text <> 'items' then null else p_items end,
    start_date = case when v_restart then v_next else r.start_date end,
    occurrences = case when v_restart then 0 else r.occurrences end,
    next_date = v_next,
    frequency = p_frequency,
    end_date = p_end_date, remaining = p_remaining, heads_up_days = p_heads_up_days,
    heads_up_for = null,
    updated_at = now()
  where id = p_id;
end $$;

revoke execute on function
  public.update_recurring(uuid, text, uuid, public.split_method, jsonb, boolean, bigint, jsonb, jsonb, text, date, integer, integer, date)
from public, anon;
grant execute on function
  public.update_recurring(uuid, text, uuid, public.split_method, jsonb, boolean, bigint, jsonb, jsonb, text, date, integer, integer, date)
to authenticated;
