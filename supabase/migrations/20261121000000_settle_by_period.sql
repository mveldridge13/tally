-- Settle one period of a recurring expense ("Rent · 17 Nov: Ester's $1,250").
--
-- A payment can now point at the expense it's for (settlements.expense_id). It still counts towards
-- the group balance exactly as before; the link is what lets the app show, per period and per
-- person, what's settled, waiting to be confirmed, or still to pay.

alter table public.settlements add column expense_id uuid references public.expenses (id) on delete set null;
create index settlements_expense on public.settlements (expense_id) where expense_id is not null;

-- A correction keeps the link of the payment it replaces.
create function public.keep_settlement_expense() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.replaces_id is not null and new.expense_id is null then
    select expense_id into new.expense_id from public.settlements where id = new.replaces_id;
  end if;
  return new;
end $$;

create trigger keep_settlement_expense
  before insert on public.settlements
  for each row execute function public.keep_settlement_expense();

-- Same rules as before (who confirms, notifications), plus the optional expense it's for.
drop function public.record_settlement(uuid, uuid, uuid, bigint, timestamptz, text);

create function public.record_settlement(
  p_group_id uuid,
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_amount_cents bigint,
  p_occurred_at timestamptz default now(),
  p_note text default null,
  p_expense_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_id uuid;
  v_status text;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  if not public.is_member_of(p_group_id, p_from_user_id) or not public.is_member_of(p_group_id, p_to_user_id) then
    raise exception 'Both people must be members of the group' using errcode = '22023';
  end if;
  if p_expense_id is not null and not exists (
    select 1 from public.expenses e where e.id = p_expense_id and e.group_id = p_group_id and e.deleted_at is null
  ) then
    raise exception 'That expense isn''t in this group' using errcode = '22023';
  end if;

  if uid = p_to_user_id or exists (select 1 from public.profiles where id = p_to_user_id and is_guest) then
    v_status := 'recorded';
  else
    v_status := 'pending';
  end if;

  insert into public.settlements (group_id, from_user_id, to_user_id, amount_cents, occurred_at, note, created_by, status, expense_id)
  values (p_group_id, p_from_user_id, p_to_user_id, p_amount_cents, p_occurred_at, p_note, uid, v_status::public.settlement_status, p_expense_id)
  returning id into v_id;

  if v_status = 'pending' then
    insert into public.notifications (user_id, kind, group_id, actor_id, amount_cents, settlement_id)
    values (p_to_user_id, 'payment_to_confirm', p_group_id, uid, p_amount_cents, v_id);
  end if;
  return v_id;
end $$;

revoke execute on function public.record_settlement(uuid, uuid, uuid, bigint, timestamptz, text, uuid) from public, anon;
grant execute on function public.record_settlement(uuid, uuid, uuid, bigint, timestamptz, text, uuid) to authenticated;
revoke execute on function public.keep_settlement_expense() from public, anon, authenticated;
