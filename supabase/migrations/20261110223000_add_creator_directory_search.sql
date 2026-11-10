-- Public creator directory search.
-- Returns only fields intended for public creator profile cards.

create or replace function public.search_public_creator_profiles(
  p_handle_query text default '',
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  handle text,
  description text,
  avatar_path text,
  verified boolean,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := left(btrim(coalesce(p_handle_query, '')), 30);
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  return query
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
      v_query = ''
      or position(lower(v_query) in lower(cp.handle)) > 0
    )
  order by cp.verified desc, lower(cp.handle), cp.id
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.search_public_creator_profiles(text, integer, integer) from public;
grant execute on function public.search_public_creator_profiles(text, integer, integer) to anon, authenticated;
