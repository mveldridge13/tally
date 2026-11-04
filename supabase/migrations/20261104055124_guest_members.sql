-- Guest members: people added to a group by name, before they have a Tally account.
--
-- A guest is a profile row with no login (is_guest = true) that belongs to one group.
-- Because expenses, splits and settlements reference profiles, guests work everywhere a
-- member does, with no change to the money rules.
--
-- Claiming: an invite can name a guest. When a signed-in user accepts it, every row in that
-- group that pointed at the guest is moved to the user in one transaction, the guest's
-- membership becomes theirs (role and join date kept), and the guest is marked claimed.
-- The guest profile stays (claimed) so old edit-history snapshots can still show its name.

-- Guests have no auth user, so profiles can no longer require one.
-- Real profiles are still only created by the on-signup trigger; guests only by add_guest.
alter table public.profiles drop constraint profiles_id_fkey;

alter table public.profiles
  add column is_guest boolean not null default false,
  add column guest_group_id uuid references public.groups (id) on delete cascade,
  add column created_by uuid references public.profiles (id),
  add column claimed_by uuid references public.profiles (id),
  add column claimed_at timestamptz,
  add constraint profiles_guest_group check (is_guest = (guest_group_id is not null));

create index profiles_guest_group_idx on public.profiles (guest_group_id) where is_guest;

alter table public.group_invites
  add column guest_id uuid references public.profiles (id);

-- Keep a real profile tied to its auth user (what the dropped foreign key used to do).
create function public.delete_profile_with_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.profiles where id = old.id and not is_guest;
  return old;
end $$;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.delete_profile_with_user();

-- ─── Add a guest ─────────────────────────────────────────────────────────────

create function public.add_guest(p_group_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid := gen_random_uuid();
  v_currency text;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Enter a name between 1 and 60 characters' using errcode = '22023';
  end if;
  select currency into v_currency from public.groups where id = p_group_id;

  insert into public.profiles (id, name, currency, is_guest, guest_group_id, created_by)
  values (v_id, v_name, v_currency, true, p_group_id, uid);

  insert into public.group_members (group_id, user_id, role) values (p_group_id, v_id, 'member');
  return v_id;
end $$;

-- ─── Invites can name a guest to claim ───────────────────────────────────────

drop function public.create_invite(uuid);

create function public.create_invite(p_group_id uuid, p_guest_id uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  v_token text;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  if p_guest_id is not null and not exists (
    select 1 from public.profiles p
    join public.group_members m on m.user_id = p.id and m.group_id = p_group_id and m.left_at is null
    where p.id = p_guest_id and p.is_guest and p.guest_group_id = p_group_id and p.claimed_by is null
  ) then
    raise exception 'That guest is not in this group, or has already joined' using errcode = '22023';
  end if;

  insert into public.group_invites (group_id, invited_by, guest_id)
  values (p_group_id, uid, p_guest_id)
  returning token into v_token;
  return v_token;
end $$;

-- ─── Accepting an invite, claiming the guest when it names one ───────────────

create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  inv public.group_invites;
  v_guest public.profiles;
begin
  select i.* into inv
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  where i.token = p_token and i.expires_at > now() and g.archived_at is null
  for update of i;
  if inv.id is null then
    raise exception 'This invite link is invalid or has expired' using errcode = 'P0002';
  end if;

  if inv.guest_id is null then
    -- Ordinary invite: join (or rejoin) the group.
    insert into public.group_members (group_id, user_id, role)
    values (inv.group_id, uid, 'member')
    on conflict (group_id, user_id) do update set left_at = null;
  else
    select * into v_guest from public.profiles where id = inv.guest_id for update;
    if v_guest.claimed_by is not null then
      raise exception 'This invite has already been used to join as %', v_guest.name using errcode = 'P0002';
    end if;
    if public.is_member_of(inv.group_id, uid) then
      raise exception 'You are already in this group, so you can’t also join as %', v_guest.name using errcode = '23505';
    end if;
    if exists (
      select 1 from public.expense_splits s join public.expenses e on e.id = s.expense_id
      where e.group_id = inv.group_id and s.user_id = uid
        and exists (select 1 from public.expense_splits s2 where s2.expense_id = s.expense_id and s2.user_id = v_guest.id)
    ) then
      raise exception 'Your account and % share past expenses in this group, so they can’t be merged', v_guest.name using errcode = '23505';
    end if;

    -- Move the guest's history in this group to the user.
    update public.expenses set payer_id = uid where group_id = inv.group_id and payer_id = v_guest.id;
    update public.expense_splits s set user_id = uid
      from public.expenses e where e.id = s.expense_id and e.group_id = inv.group_id and s.user_id = v_guest.id;
    update public.settlements set from_user_id = uid where group_id = inv.group_id and from_user_id = v_guest.id;
    update public.settlements set to_user_id = uid where group_id = inv.group_id and to_user_id = v_guest.id;

    -- The guest's membership becomes theirs; an old row from leaving earlier is replaced.
    delete from public.group_members where group_id = inv.group_id and user_id = uid;
    update public.group_members set user_id = uid, left_at = null where group_id = inv.group_id and user_id = v_guest.id;

    update public.profiles set claimed_by = uid, claimed_at = now() where id = v_guest.id;
  end if;

  update public.group_invites set accepted_at = coalesce(accepted_at, now()), accepted_by = coalesce(accepted_by, uid)
  where id = inv.id;

  return inv.group_id;
end $$;

-- A guest invite can be used once; expire it as soon as it is claimed.
create function public.expire_claimed_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.guest_id is not null and new.accepted_at is not null and old.accepted_at is null then
    new.expires_at := now();
  end if;
  return new;
end $$;

create trigger group_invites_expire_claimed
  before update on public.group_invites
  for each row execute function public.expire_claimed_invite();

-- Remove a guest (or any member) uses remove_member: owner only, balance must be zero.

revoke execute on function
  public.add_guest(uuid, text),
  public.create_invite(uuid, uuid),
  public.delete_profile_with_user(),
  public.expire_claimed_invite()
from public, anon;
grant execute on function public.add_guest(uuid, text), public.create_invite(uuid, uuid) to authenticated;
revoke execute on function public.delete_profile_with_user(), public.expire_claimed_invite() from authenticated;
