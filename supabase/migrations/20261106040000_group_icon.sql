-- Group icons: an optional emoji shown instead of the group's first letter.
-- Any member can set or clear it; null means "use the letter".

alter table public.groups
  add column icon text check (icon is null or char_length(icon) between 1 and 16);

drop function public.create_group(text, text);

create function public.create_group(p_name text, p_currency text, p_icon text default null) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  g public.groups;
begin
  insert into public.groups (name, currency, created_by, icon)
  values (trim(p_name), upper(p_currency), uid, nullif(trim(coalesce(p_icon, '')), ''))
  returning * into g;

  insert into public.group_members (group_id, user_id, role) values (g.id, uid, 'owner');
  return g;
end $$;

create function public.set_group_icon(p_group_id uuid, p_icon text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
begin
  if public.group_role_of(p_group_id, uid) is null then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  update public.groups set icon = nullif(trim(coalesce(p_icon, '')), '') where id = p_group_id;
end $$;

revoke execute on function public.create_group(text, text, text), public.set_group_icon(uuid, text) from public, anon;
grant execute on function public.create_group(text, text, text), public.set_group_icon(uuid, text) to authenticated;
