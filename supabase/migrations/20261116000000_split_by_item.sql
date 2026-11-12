-- Split by item: each line of a bill is shared by the people who had it; tax, tip and other
-- extras on top of the items are shared in proportion. The app works out each person's share
-- (same engine as the other methods) and the items are kept so the expense can show and edit them.

alter type public.split_method add value if not exists 'items';

-- [{ "name": "Pasta", "amount_cents": 2500, "user_ids": ["<uuid>", …] }, …]; null for other methods.
alter table public.expenses add column items jsonb;

-- Items must be well formed, only name people in the split, and not add up to more than the bill.
create function public.validate_items(p_amount_cents bigint, p_splits jsonb, p_items jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  v_user text;
  v_name text;
  v_amount bigint;
  total bigint := 0;
  people text[];
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'An expense can have at most 100 items' using errcode = '22023';
  end if;
  select array_agg(s ->> 'user_id') into people from jsonb_array_elements(p_splits) s;

  for item in select * from jsonb_array_elements(p_items) loop
    v_name := trim(item ->> 'name');
    if v_name is null or char_length(v_name) not between 1 and 60 then
      raise exception 'Every item needs a name of up to 60 characters' using errcode = '22023';
    end if;
    if jsonb_typeof(item -> 'amount_cents') <> 'number' then
      raise exception 'Every item needs a price' using errcode = '22023';
    end if;
    v_amount := (item ->> 'amount_cents')::bigint;
    if v_amount <= 0 then
      raise exception 'Every item needs a price' using errcode = '22023';
    end if;
    if jsonb_typeof(item -> 'user_ids') <> 'array' or jsonb_array_length(item -> 'user_ids') = 0 then
      raise exception 'Choose who had %', v_name using errcode = '22023';
    end if;
    for v_user in select * from jsonb_array_elements_text(item -> 'user_ids') loop
      if not (v_user = any (people)) then
        raise exception 'Everyone who had % must be in the split', v_name using errcode = '22023';
      end if;
    end loop;
    total := total + v_amount;
  end loop;

  if total > p_amount_cents then
    raise exception 'Items add up to % but the expense is %', total, p_amount_cents using errcode = '22023';
  end if;
end $$;

-- Same bodies as before, plus the items. p_items defaults to null so older app builds keep working.
drop function public.create_expense(uuid, text, bigint, uuid, public.split_method, jsonb, timestamptz, text);
drop function public.update_expense(uuid, text, bigint, uuid, public.split_method, jsonb, timestamptz, text);

create function public.create_expense(
  p_group_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_payer_id uuid,
  p_split_method public.split_method,
  p_splits jsonb,
  p_occurred_at timestamptz default now(),
  p_notes text default null,
  p_items jsonb default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  if not public.is_member_of(p_group_id, p_payer_id) then
    raise exception 'The payer must be a member of the group' using errcode = '22023';
  end if;
  perform public.validate_splits(p_group_id, p_amount_cents, p_splits);
  if p_split_method::text = 'items' then
    perform public.validate_items(p_amount_cents, p_splits, p_items);
  end if;

  insert into public.expenses (group_id, description, amount_cents, payer_id, created_by, split_method, occurred_at, notes, items)
  values (p_group_id, trim(p_description), p_amount_cents, p_payer_id, uid, p_split_method, p_occurred_at, p_notes,
          case when p_split_method::text = 'items' then p_items end)
  returning id into v_id;

  insert into public.expense_splits (expense_id, user_id, amount_cents, weight)
  select v_id, (s ->> 'user_id')::uuid, (s ->> 'amount_cents')::bigint, (s ->> 'weight')::integer
  from jsonb_array_elements(p_splits) s;

  return v_id;
end $$;

create function public.update_expense(
  p_expense_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_payer_id uuid,
  p_split_method public.split_method,
  p_splits jsonb,
  p_occurred_at timestamptz,
  p_notes text default null,
  p_items jsonb default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_group uuid;
  v_creator uuid;
begin
  select group_id, created_by into v_group, v_creator from public.expenses where id = p_expense_id and deleted_at is null for update;
  if v_group is null or not public.can_see_expense(v_group, v_creator) then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if not public.is_member_of(v_group, p_payer_id) then
    raise exception 'The payer must be a member of the group' using errcode = '22023';
  end if;
  perform public.validate_splits(v_group, p_amount_cents, p_splits);
  if p_split_method::text = 'items' then
    perform public.validate_items(p_amount_cents, p_splits, p_items);
  end if;

  insert into public.expense_revisions (expense_id, edited_by, before)
  values (p_expense_id, uid, public.expense_snapshot(p_expense_id));

  update public.expenses
  set description = trim(p_description), amount_cents = p_amount_cents, payer_id = p_payer_id,
      split_method = p_split_method, occurred_at = p_occurred_at, notes = p_notes,
      items = case when p_split_method::text = 'items' then p_items end
  where id = p_expense_id;

  delete from public.expense_splits where expense_id = p_expense_id;
  insert into public.expense_splits (expense_id, user_id, amount_cents, weight)
  select p_expense_id, (s ->> 'user_id')::uuid, (s ->> 'amount_cents')::bigint, (s ->> 'weight')::integer
  from jsonb_array_elements(p_splits) s;
end $$;

-- When a guest's history moves to the person who claimed them, their name on items moves too.
create function public.move_item_people() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.expenses
  set items = replace(items::text, old.user_id::text, new.user_id::text)::jsonb
  where id = new.expense_id and items is not null;
  return new;
end $$;

create trigger expense_splits_move_item_people
  after update of user_id on public.expense_splits
  for each row when (old.user_id is distinct from new.user_id)
  execute function public.move_item_people();

revoke execute on function
  public.create_expense(uuid, text, bigint, uuid, public.split_method, jsonb, timestamptz, text, jsonb),
  public.update_expense(uuid, text, bigint, uuid, public.split_method, jsonb, timestamptz, text, jsonb),
  public.validate_items(bigint, jsonb, jsonb),
  public.move_item_people()
from public, anon;
grant execute on function
  public.create_expense(uuid, text, bigint, uuid, public.split_method, jsonb, timestamptz, text, jsonb),
  public.update_expense(uuid, text, bigint, uuid, public.split_method, jsonb, timestamptz, text, jsonb)
to authenticated;
