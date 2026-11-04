-- Correcting a recorded payment.
--
-- A correction never overwrites history: the original payment is voided and a new one is
-- recorded in the same transaction, pointing back at it through replaces_id. The payment
-- details screen can then show "corrects an earlier payment of A$x".

alter table public.settlements
  add column replaces_id uuid references public.settlements (id);

create index settlements_replaces_idx on public.settlements (replaces_id);

create function public.correct_settlement(
  p_settlement_id uuid,
  p_amount_cents bigint,
  p_occurred_at timestamptz default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  old public.settlements;
  v_id uuid;
begin
  select * into old from public.settlements
  where id = p_settlement_id and status = 'recorded'
  for update;
  if old.id is null or not public.is_group_member(old.group_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;
  -- Both people must still be in the group, as when recording a new payment.
  if not public.is_member_of(old.group_id, old.from_user_id) or not public.is_member_of(old.group_id, old.to_user_id) then
    raise exception 'Both people must still be members of the group' using errcode = '22023';
  end if;

  update public.settlements set status = 'voided' where id = old.id;

  insert into public.settlements (group_id, from_user_id, to_user_id, amount_cents, occurred_at, note, created_by, replaces_id)
  values (old.group_id, old.from_user_id, old.to_user_id, p_amount_cents, coalesce(p_occurred_at, old.occurred_at), p_note, uid, old.id)
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function public.correct_settlement(uuid, bigint, timestamptz, text) from public, anon;
grant execute on function public.correct_settlement(uuid, bigint, timestamptz, text) to authenticated;
