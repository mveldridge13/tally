-- Tally initial schema
--
-- Money rule: every monetary column is an integer number of minor units (cents),
-- suffixed _cents. $125.50 is stored as 12550. Never float/numeric.
--
-- Ledger rule: expenses and settlements are facts. Repayments are settlements and never
-- modify an expense. Expense edits snapshot into expense_revisions; deletes are soft.
--
-- Security model: the app talks to Postgres directly through Supabase, so
--   * every table has Row Level Security; members can only read their own groups' data
--   * clients cannot insert/update/delete ledger tables directly. All writes go through
--     SECURITY DEFINER functions below, which validate membership and that splits sum
--     exactly to the expense amount, inside one transaction.

-- ─────────────────────────────────────────────────────────────────────────────
-- Types
-- ─────────────────────────────────────────────────────────────────────────────

create type public.group_role as enum ('owner', 'admin', 'member');
create type public.split_method as enum ('equal', 'exact', 'percentage', 'shares');
create type public.settlement_status as enum ('recorded', 'voided');

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  avatar_url  text,
  currency    text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  currency    text not null check (currency ~ '^[A-Z]{3}$'),
  created_by  uuid not null references public.profiles (id),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id),
  role      public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  -- Set when a member leaves. Their history stays so balances remain correct.
  left_at   timestamptz,
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.group_invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  invited_by  uuid not null references public.profiles (id),
  token       text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index group_invites_group_idx on public.group_invites (group_id);

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  description   text not null check (char_length(description) between 1 and 120),
  amount_cents  bigint not null check (amount_cents > 0),
  payer_id      uuid not null references public.profiles (id),
  created_by    uuid not null references public.profiles (id),
  split_method  public.split_method not null,
  -- When the expense happened (user-chosen), as opposed to created_at.
  occurred_at   timestamptz not null default now(),
  notes         text check (char_length(notes) <= 1000),
  receipt_path  text, -- Supabase Storage object path (P2)
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index expenses_group_idx on public.expenses (group_id, occurred_at desc);

create table public.expense_splits (
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  user_id      uuid not null references public.profiles (id),
  amount_cents bigint not null check (amount_cents >= 0),
  -- Input that produced the share, so the edit screen can show it again:
  -- basis points for percentage (3333 = 33.33%), units for shares, null otherwise.
  weight       integer check (weight >= 0),
  primary key (expense_id, user_id)
);
create index expense_splits_user_idx on public.expense_splits (user_id);

create table public.expense_revisions (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  edited_by  uuid not null references public.profiles (id),
  before     jsonb not null,
  created_at timestamptz not null default now()
);
create index expense_revisions_expense_idx on public.expense_revisions (expense_id);

create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id), -- person paying back
  to_user_id   uuid not null references public.profiles (id), -- person receiving
  amount_cents bigint not null check (amount_cents > 0),
  status       public.settlement_status not null default 'recorded',
  occurred_at  timestamptz not null default now(),
  note         text check (char_length(note) <= 280),
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);
create index settlements_group_idx on public.settlements (group_id, occurred_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────────

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger groups_touch   before update on public.groups   for each row execute function public.touch_updated_at();
create trigger expenses_touch before update on public.expenses for each row execute function public.touch_updated_at();

-- Create a profile for every new auth user. Name comes from sign-up metadata.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1), 'Tally user')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Is the current user an active member of the group? SECURITY DEFINER so RLS policies
-- can call it without recursing into group_members' own policy.
create function public.is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = (select auth.uid()) and left_at is null
  );
$$;

create function public.is_member_of(p_group_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id and left_at is null
  );
$$;

-- Do the current user and p_user_id share any group? (Used to see co-members' profiles.)
create function public.shares_group_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members them on them.group_id = me.group_id
    where me.user_id = (select auth.uid()) and them.user_id = p_user_id
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles          enable row level security;
alter table public.groups            enable row level security;
alter table public.group_members     enable row level security;
alter table public.group_invites     enable row level security;
alter table public.expenses          enable row level security;
alter table public.expense_splits    enable row level security;
alter table public.expense_revisions enable row level security;
alter table public.settlements       enable row level security;

create policy "read own or co-member profiles" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members read groups" on public.groups for select to authenticated
  using (public.is_group_member(id));

create policy "members read membership" on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

create policy "members read invites" on public.group_invites for select to authenticated
  using (public.is_group_member(group_id));

create policy "members read expenses" on public.expenses for select to authenticated
  using (public.is_group_member(group_id));

create policy "members read splits" on public.expense_splits for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id)));

create policy "members read revisions" on public.expense_revisions for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id)));

create policy "members read settlements" on public.settlements for select to authenticated
  using (public.is_group_member(group_id));

-- No insert/update/delete policies on ledger tables: writes only via the functions below.
-- Belt and braces: remove table write privileges from client roles too.
revoke insert, update, delete, truncate on
  public.groups, public.group_members, public.group_invites, public.expenses,
  public.expense_splits, public.expense_revisions, public.settlements
from anon, authenticated;
revoke insert, delete, truncate on public.profiles from anon, authenticated;
revoke all on all tables in schema public from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Write API (RPC). Called from the app as supabase.rpc('<name>', {...}).
-- ─────────────────────────────────────────────────────────────────────────────

create function public.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  return uid;
end $$;

create function public.create_group(p_name text, p_currency text) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  g public.groups;
begin
  insert into public.groups (name, currency, created_by)
  values (trim(p_name), upper(p_currency), uid)
  returning * into g;

  insert into public.group_members (group_id, user_id, role) values (g.id, uid, 'owner');
  return g;
end $$;

-- Validate a splits array: [{ "user_id": uuid, "amount_cents": int, "weight": int|null }, ...]
-- Every participant must be an active group member, appear once, have a non-negative
-- whole-cent share, and shares must sum exactly to the amount.
create function public.validate_splits(p_group_id uuid, p_amount_cents bigint, p_splits jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  s jsonb;
  total bigint := 0;
  seen uuid[] := '{}'::uuid[];
  v_user uuid;
  v_amount numeric;
begin
  if jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'An expense needs at least one participant' using errcode = '22023';
  end if;

  for s in select * from jsonb_array_elements(p_splits) loop
    v_user := (s ->> 'user_id')::uuid;
    v_amount := (s ->> 'amount_cents')::numeric;

    if v_amount is null or v_amount <> trunc(v_amount) or v_amount < 0 then
      raise exception 'Split amounts must be non-negative whole cents' using errcode = '22023';
    end if;
    if v_user = any (seen) then
      raise exception 'A participant appears more than once' using errcode = '22023';
    end if;
    if not public.is_member_of(p_group_id, v_user) then
      raise exception 'Every participant must be a member of the group' using errcode = '22023';
    end if;

    seen := seen || v_user;
    total := total + v_amount::bigint;
  end loop;

  if total <> p_amount_cents then
    raise exception 'Splits add up to % but the expense is %', total, p_amount_cents using errcode = '22023';
  end if;
end $$;

create function public.create_expense(
  p_group_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_payer_id uuid,
  p_split_method public.split_method,
  p_splits jsonb,
  p_occurred_at timestamptz default now(),
  p_notes text default null
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

  insert into public.expenses (group_id, description, amount_cents, payer_id, created_by, split_method, occurred_at, notes)
  values (p_group_id, trim(p_description), p_amount_cents, p_payer_id, uid, p_split_method, p_occurred_at, p_notes)
  returning id into v_id;

  insert into public.expense_splits (expense_id, user_id, amount_cents, weight)
  select v_id, (s ->> 'user_id')::uuid, (s ->> 'amount_cents')::bigint, (s ->> 'weight')::integer
  from jsonb_array_elements(p_splits) s;

  return v_id;
end $$;

-- Snapshot an expense and its splits as JSON (for revisions).
create function public.expense_snapshot(p_expense_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(e) || jsonb_build_object(
    'splits', coalesce((select jsonb_agg(to_jsonb(s)) from public.expense_splits s where s.expense_id = e.id), '[]'::jsonb)
  )
  from public.expenses e where e.id = p_expense_id;
$$;

create function public.update_expense(
  p_expense_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_payer_id uuid,
  p_split_method public.split_method,
  p_splits jsonb,
  p_occurred_at timestamptz,
  p_notes text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_group uuid;
begin
  select group_id into v_group from public.expenses where id = p_expense_id and deleted_at is null for update;
  if v_group is null or not public.is_group_member(v_group) then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if not public.is_member_of(v_group, p_payer_id) then
    raise exception 'The payer must be a member of the group' using errcode = '22023';
  end if;
  perform public.validate_splits(v_group, p_amount_cents, p_splits);

  insert into public.expense_revisions (expense_id, edited_by, before)
  values (p_expense_id, uid, public.expense_snapshot(p_expense_id));

  update public.expenses
  set description = trim(p_description), amount_cents = p_amount_cents, payer_id = p_payer_id,
      split_method = p_split_method, occurred_at = p_occurred_at, notes = p_notes
  where id = p_expense_id;

  delete from public.expense_splits where expense_id = p_expense_id;
  insert into public.expense_splits (expense_id, user_id, amount_cents, weight)
  select p_expense_id, (s ->> 'user_id')::uuid, (s ->> 'amount_cents')::bigint, (s ->> 'weight')::integer
  from jsonb_array_elements(p_splits) s;
end $$;

create function public.delete_expense(p_expense_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_group uuid;
begin
  select group_id into v_group from public.expenses where id = p_expense_id and deleted_at is null for update;
  if v_group is null or not public.is_group_member(v_group) then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;

  insert into public.expense_revisions (expense_id, edited_by, before)
  values (p_expense_id, uid, public.expense_snapshot(p_expense_id));

  update public.expenses set deleted_at = now() where id = p_expense_id;
end $$;

create function public.record_settlement(
  p_group_id uuid,
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_amount_cents bigint,
  p_occurred_at timestamptz default now(),
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  if not public.is_member_of(p_group_id, p_from_user_id) or not public.is_member_of(p_group_id, p_to_user_id) then
    raise exception 'Both people must be members of the group' using errcode = '22023';
  end if;

  insert into public.settlements (group_id, from_user_id, to_user_id, amount_cents, occurred_at, note, created_by)
  values (p_group_id, p_from_user_id, p_to_user_id, p_amount_cents, p_occurred_at, p_note, uid)
  returning id into v_id;
  return v_id;
end $$;

create function public.void_settlement(p_settlement_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_group uuid;
begin
  perform public.require_user();
  select group_id into v_group from public.settlements where id = p_settlement_id and status = 'recorded' for update;
  if v_group is null or not public.is_group_member(v_group) then
    raise exception 'Settlement not found' using errcode = 'P0002';
  end if;
  update public.settlements set status = 'voided' where id = p_settlement_id;
end $$;

create function public.create_invite(p_group_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_token text;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  insert into public.group_invites (group_id, invited_by) values (p_group_id, uid) returning token into v_token;
  return v_token;
end $$;

create function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  inv public.group_invites;
begin
  select * into inv from public.group_invites
  where token = p_token and expires_at > now()
  for update;
  if inv.id is null then
    raise exception 'This invite link is invalid or has expired' using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (inv.group_id, uid, 'member')
  on conflict (group_id, user_id) do update set left_at = null;

  update public.group_invites set accepted_at = coalesce(accepted_at, now()), accepted_by = coalesce(accepted_by, uid)
  where id = inv.id;

  return inv.group_id;
end $$;

-- Net balance per member. Positive = the group owes them; negative = they owe.
-- Payer is credited the full amount, each participant is debited their share;
-- a settlement credits the payer and debits the receiver. Always sums to zero.
create function public.group_balances(p_group_id uuid)
returns table (user_id uuid, balance_cents bigint)
language sql stable security definer set search_path = '' as $$
  with ledger as (
    select e.payer_id as user_id, e.amount_cents as delta
    from public.expenses e where e.group_id = p_group_id and e.deleted_at is null
    union all
    select s.user_id, -s.amount_cents
    from public.expense_splits s join public.expenses e on e.id = s.expense_id
    where e.group_id = p_group_id and e.deleted_at is null
    union all
    select st.from_user_id, st.amount_cents
    from public.settlements st where st.group_id = p_group_id and st.status = 'recorded'
    union all
    select st.to_user_id, -st.amount_cents
    from public.settlements st where st.group_id = p_group_id and st.status = 'recorded'
    union all
    select m.user_id, 0 from public.group_members m where m.group_id = p_group_id
  )
  select l.user_id, sum(l.delta)::bigint
  from ledger l
  where public.is_group_member(p_group_id)
  group by l.user_id;
$$;

-- Lock down function execution: signed-in users only, and only the public API.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_group(text, text),
  public.create_expense(uuid, text, bigint, uuid, public.split_method, jsonb, timestamptz, text),
  public.update_expense(uuid, text, bigint, uuid, public.split_method, jsonb, timestamptz, text),
  public.delete_expense(uuid),
  public.record_settlement(uuid, uuid, uuid, bigint, timestamptz, text),
  public.void_settlement(uuid),
  public.create_invite(uuid),
  public.accept_invite(text),
  public.group_balances(uuid),
  public.is_group_member(uuid),
  public.shares_group_with(uuid)
to authenticated;
revoke execute on function
  public.validate_splits(uuid, bigint, jsonb),
  public.expense_snapshot(uuid),
  public.is_member_of(uuid, uuid),
  public.require_user(),
  public.handle_new_user(),
  public.touch_updated_at()
from authenticated;
