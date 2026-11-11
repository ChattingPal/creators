-- Verified creator handles may only be changed through authorised support or
-- administrative tooling, not by an ordinary authenticated Creator Hub user.

revoke update (is_public) on table public.creator_profiles from authenticated;

create or replace function public.prevent_verified_creator_handle_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.verified = true
    and new.handle is distinct from old.handle
    and coalesce(auth.role(), '') = 'authenticated'
  then
    raise exception 'Verified creator handles require support review.' using errcode = '42501';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'creator_profiles_protect_verified_handle'
      and tgrelid = 'public.creator_profiles'::regclass
  ) then
    create trigger creator_profiles_protect_verified_handle
      before update of handle on public.creator_profiles
      for each row execute function public.prevent_verified_creator_handle_change();
  end if;
end;
$$;
