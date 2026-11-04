-- Payment methods, starting with PayID (phase 1: details only).
--
-- People save their PayID so others in their groups can copy it into a banking app.
-- Tally never moves money and never verifies the PayID; there is deliberately no
-- "verified" column until a payment provider can actually verify it.
--
-- A general table with a `kind`, so bank transfer or PayPal can be added later without
-- reworking settlements. One PayID per person for now.
--
-- Privacy: a PayID is a phone number or email address. Only the owner and people who
-- share a group with them can read it; only the owner can change it (through set_payid).
--
-- Australia only: PayID is an Australian service, so only people whose profile currency is
-- AUD can save one, and the app only shows PayIDs in AUD groups.

create table public.payment_methods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('payid')),
  payid_type    text not null check (payid_type in ('phone', 'email', 'abn')),
  -- Stored normalised: +614XXXXXXXX, lower-case email, or 11 ABN digits.
  value         text not null,
  -- The name the bank shows for this PayID, so the payer can check it before paying.
  account_name  text check (char_length(account_name) <= 140),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, kind),
  check (
    (payid_type = 'phone' and value ~ '^\+614[0-9]{8}$') or
    (payid_type = 'email' and value ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and char_length(value) <= 254 and value = lower(value)) or
    (payid_type = 'abn'   and value ~ '^[0-9]{11}$')
  )
);

create trigger payment_methods_touch before update on public.payment_methods
  for each row execute function public.touch_updated_at();

alter table public.payment_methods enable row level security;

create policy "read own or co-member payment methods" on public.payment_methods for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_group_with(user_id));

-- Writes only through the functions below.
revoke insert, update, delete, truncate on public.payment_methods from anon, authenticated;
revoke all on public.payment_methods from anon;

-- ABN checksum (ATO): subtract 1 from the first digit, weight the digits, total divisible by 89.
create function public.is_valid_abn(p_abn text) returns boolean
language sql immutable set search_path = '' as $$
  select p_abn ~ '^[0-9]{11}$' and (
    (substr(p_abn, 1, 1)::int - 1) * 10 + substr(p_abn, 2, 1)::int * 1 + substr(p_abn, 3, 1)::int * 3 +
    substr(p_abn, 4, 1)::int * 5 + substr(p_abn, 5, 1)::int * 7 + substr(p_abn, 6, 1)::int * 9 +
    substr(p_abn, 7, 1)::int * 11 + substr(p_abn, 8, 1)::int * 13 + substr(p_abn, 9, 1)::int * 15 +
    substr(p_abn, 10, 1)::int * 17 + substr(p_abn, 11, 1)::int * 19
  ) % 89 = 0;
$$;

-- Save (or replace) your PayID. The app sends the normalised value; the table checks re-validate it.
create function public.set_payid(p_type text, p_value text, p_account_name text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
begin
  if exists (select 1 from public.profiles where id = uid and is_guest) then
    raise exception 'Guests can’t save a PayID' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid and currency = 'AUD') then
    raise exception 'PayID is only available in Australia. Set your default currency to AUD to add one.' using errcode = '22023';
  end if;
  if p_type = 'abn' and not public.is_valid_abn(p_value) then
    raise exception 'That ABN doesn’t look right. Check the digits.' using errcode = '22023';
  end if;

  insert into public.payment_methods (user_id, kind, payid_type, value, account_name)
  values (uid, 'payid', p_type, p_value, nullif(trim(p_account_name), ''))
  on conflict (user_id, kind) do update
    set payid_type = excluded.payid_type, value = excluded.value, account_name = excluded.account_name;
end $$;

create function public.remove_payid() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
begin
  delete from public.payment_methods where user_id = uid and kind = 'payid';
end $$;

revoke execute on function public.set_payid(text, text, text), public.remove_payid(), public.is_valid_abn(text) from public, anon;
grant execute on function public.set_payid(text, text, text), public.remove_payid() to authenticated;
