-- Additive Creator Hub profile schema.
-- The production schema was not available through the public API during implementation.
-- Verify that public.creator_profiles and the creator-avatars bucket do not conflict with
-- separately created production objects before applying this migration.

create extension if not exists pgcrypto;

create table if not exists public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  ownerid uuid not null default auth.uid() references auth.users (id) on delete cascade,
  handle text not null,
  description text,
  avatar_path text,
  verified boolean not null default false,
  status text not null default 'beta',
  is_public boolean not null default true,
  creation_token uuid not null unique,
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_profiles_handle_format check (
    handle = btrim(handle)
    and char_length(handle) between 3 and 30
    and handle ~ '^[A-Za-z0-9_]+$'
  ),
  constraint creator_profiles_description_length check (
    description is null or char_length(description) <= 500
  ),
  constraint creator_profiles_status_format check (
    status ~ '^[a-z][a-z0-9_]{1,30}$'
  ),
  constraint creator_profiles_avatar_owner_path check (
    avatar_path is null or avatar_path like ownerid::text || '/%'
  )
);

comment on table public.creator_profiles is
  'Public-facing creator profile data with private ownership and acceptance metadata.';
comment on column public.creator_profiles.ownerid is
  'The immutable auth.users.id of the account that owns this creator profile.';
comment on column public.creator_profiles.creation_token is
  'Browser-generated idempotency token used to prevent duplicate profile creation on retries.';

create unique index if not exists creator_profiles_handle_ci_unique
  on public.creator_profiles (lower(handle));

create index if not exists creator_profiles_owner_created_idx
  on public.creator_profiles (ownerid, created_at desc);

alter table public.creator_profiles enable row level security;

create or replace function public.prevent_creator_profile_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ownerid is distinct from old.ownerid then
    raise exception 'Creator profile ownership cannot be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.set_creator_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'creator_profiles_owner_immutable'
      and tgrelid = 'public.creator_profiles'::regclass
  ) then
    create trigger creator_profiles_owner_immutable
      before update of ownerid on public.creator_profiles
      for each row execute function public.prevent_creator_profile_owner_change();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'creator_profiles_set_updated_at'
      and tgrelid = 'public.creator_profiles'::regclass
  ) then
    create trigger creator_profiles_set_updated_at
      before update on public.creator_profiles
      for each row execute function public.set_creator_profile_updated_at();
  end if;

end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'creator_profiles'
      and policyname = 'creator_profiles_owner_select'
  ) then
    create policy creator_profiles_owner_select
      on public.creator_profiles
      for select
      to authenticated
      using ((select auth.uid()) = ownerid);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'creator_profiles'
      and policyname = 'creator_profiles_owner_update'
  ) then
    create policy creator_profiles_owner_update
      on public.creator_profiles
      for update
      to authenticated
      using ((select auth.uid()) = ownerid)
      with check ((select auth.uid()) = ownerid);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'creator_profiles'
      and policyname = 'creator_profiles_owner_delete'
  ) then
    create policy creator_profiles_owner_delete
      on public.creator_profiles
      for delete
      to authenticated
      using ((select auth.uid()) = ownerid);
  end if;
end;
$$;

revoke all on table public.creator_profiles from anon, authenticated;
grant select on table public.creator_profiles to authenticated;
grant update (handle, description, avatar_path, is_public) on table public.creator_profiles to authenticated;
grant delete on table public.creator_profiles to authenticated;

create or replace function public.create_creator_profile(
  p_handle text,
  p_description text,
  p_creation_token uuid,
  p_terms_accepted boolean
)
returns table (
  id uuid,
  handle text,
  description text,
  avatar_path text,
  verified boolean,
  status text,
  created_at timestamptz,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.creator_profiles%rowtype;
  v_created boolean := false;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_terms_accepted is distinct from true then
    raise exception 'Terms acceptance is required.' using errcode = '23514';
  end if;

  insert into public.creator_profiles (
    ownerid,
    handle,
    description,
    creation_token,
    terms_version,
    terms_accepted_at,
    status,
    verified
  )
  values (
    v_user_id,
    p_handle,
    nullif(p_description, ''),
    p_creation_token,
    '2026-11-10',
    now(),
    'beta',
    false
  )
  on conflict (creation_token) do nothing
  returning * into v_profile;

  if found then
    v_created := true;
  else
    select cp.*
      into v_profile
      from public.creator_profiles as cp
      where cp.creation_token = p_creation_token
        and cp.ownerid = v_user_id;

    if not found then
      raise exception 'The creation request could not be resumed.' using errcode = '42501';
    end if;
  end if;

  return query
  select
    v_profile.id,
    v_profile.handle,
    v_profile.description,
    v_profile.avatar_path,
    v_profile.verified,
    v_profile.status,
    v_profile.created_at,
    v_created;
end;
$$;

revoke all on function public.create_creator_profile(text, text, uuid, boolean) from public;
grant execute on function public.create_creator_profile(text, text, uuid, boolean) to authenticated;

create or replace function public.get_public_creator_profile(p_profile_key text)
returns table (
  id uuid,
  handle text,
  description text,
  avatar_path text,
  verified boolean,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    cp.id,
    cp.handle,
    cp.description,
    cp.avatar_path,
    cp.verified,
    cp.status,
    cp.created_at
  from public.creator_profiles as cp
  where cp.is_public = true
    and (
      cp.id::text = p_profile_key
      or lower(cp.handle) = lower(p_profile_key)
    )
  limit 1;
$$;

revoke all on function public.get_public_creator_profile(text) from public;
grant execute on function public.get_public_creator_profile(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-avatars',
  'creator-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'creator_avatars_public_read'
  ) then
    create policy creator_avatars_public_read
      on storage.objects
      for select
      to public
      using (bucket_id = 'creator-avatars');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'creator_avatars_owner_insert'
  ) then
    create policy creator_avatars_owner_insert
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'creator-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'creator_avatars_owner_update'
  ) then
    create policy creator_avatars_owner_update
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'creator-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
      with check (
        bucket_id = 'creator-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'creator_avatars_owner_delete'
  ) then
    create policy creator_avatars_owner_delete
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'creator-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;
end;
$$;
