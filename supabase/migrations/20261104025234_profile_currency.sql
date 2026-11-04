-- Default currency from the user's location.
--
-- The app sends the device's currency (e.g. AUD in Australia) at sign-up, and keeps an
-- unchosen profile currency in sync with the device. Once the user picks a currency in
-- Profile, currency_chosen is set and the app stops changing it.

alter table public.profiles
  add column currency_chosen boolean not null default false;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_currency text := upper(coalesce(new.raw_user_meta_data ->> 'currency', ''));
begin
  insert into public.profiles (id, name, currency)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1), 'Tally user'),
    case when v_currency ~ '^[A-Z]{3}$' then v_currency else 'USD' end
  );
  return new;
end $$;
