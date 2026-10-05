-- Personal Vault: catch-up script.
-- Run this ONCE in the Supabase SQL editor if the app says your database is out of date.
-- It brings a database that already has migration 0001 fully up to date. Safe to run more than once.

-- ===== 0002_helpers =====
-- Phase 4 helpers. Safe to re-run (create or replace).
-- All functions are SECURITY INVOKER, so RLS limits them to the caller's own rows.

-- Dashboard numbers in one round trip.
create or replace function public.get_dashboard_stats()
returns table (total_documents bigint, total_folders bigint, favorites bigint, storage_used bigint)
language sql stable security invoker set search_path = ''
as $$
  select
    (select count(*) from public.documents where deleted_at is null),
    (select count(*) from public.folders),
    (select count(*) from public.documents where deleted_at is null and is_favorite),
    -- includes Trash: those objects still occupy storage until permanently deleted
    (select coalesce(sum(file_size), 0)::bigint from public.documents);
$$;
revoke execute on function public.get_dashboard_stats() from public, anon;
grant execute on function public.get_dashboard_stats() to authenticated;

-- Number of (non-trashed) documents directly inside each folder.
create or replace function public.get_folder_doc_counts()
returns table (folder_id uuid, document_count bigint)
language sql stable security invoker set search_path = ''
as $$
  select d.folder_id, count(*)::bigint
  from public.documents d
  where d.deleted_at is null and d.folder_id is not null
  group by d.folder_id;
$$;
revoke execute on function public.get_folder_doc_counts() from public, anon;
grant execute on function public.get_folder_doc_counts() to authenticated;

-- Search by filename, description, folder name, or tag. Used from phase 5.
create or replace function public.search_documents(
  p_query text default null,
  p_file_type text default null,
  p_folder_id uuid default null,
  p_tag_id uuid default null,
  p_favorites_only boolean default false,
  p_limit int default 50,
  p_offset int default 0
)
returns setof public.documents
language sql stable security invoker set search_path = ''
as $$
  with q as (
    select case when p_query is null or btrim(p_query) = '' then null
      else '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' end as pat
  )
  select d.*
  from public.documents d, q
  where d.deleted_at is null
    and (p_file_type is null or d.file_type = p_file_type)
    and (p_folder_id is null or d.folder_id = p_folder_id)
    and (not p_favorites_only or d.is_favorite)
    and (p_tag_id is null or exists (
          select 1 from public.document_tags dt where dt.document_id = d.id and dt.tag_id = p_tag_id))
    and (q.pat is null
         or d.file_name ilike q.pat
         or d.description ilike q.pat
         or exists (select 1 from public.folders f where f.id = d.folder_id and f.name ilike q.pat)
         or exists (select 1 from public.document_tags dt join public.tags t on t.id = dt.tag_id
                    where dt.document_id = d.id and t.name ilike q.pat))
  order by d.updated_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;
revoke execute on function public.search_documents(text, text, uuid, uuid, boolean, int, int) from public, anon;
grant execute on function public.search_documents(text, text, uuid, uuid, boolean, int, int) to authenticated;

-- ===== 0003_fix_folder_policies =====
-- Fixes "infinite recursion detected in policy for relation folders" (HTTP 500 when creating folders).
-- Cause: the folders INSERT/UPDATE policies queried the folders table from inside their own check.
-- Fix: do the "does this folder belong to me?" lookup in a helper function instead.
-- Also fixes an ambiguous column reference that would have rejected every subfolder insert.

-- plpgsql is never inlined, so the lookup runs at execution time instead of during policy expansion.
create or replace function public.owns_folder(p_folder_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.folders f
    where f.id = p_folder_id and f.user_id = (select auth.uid())
  );
end;
$$;
revoke execute on function public.owns_folder(uuid) from public, anon;
grant execute on function public.owns_folder(uuid) to authenticated;

drop policy if exists folders_insert_own on public.folders;
drop policy if exists folders_update_own on public.folders;
drop policy if exists documents_insert_own on public.documents;
drop policy if exists documents_update_own on public.documents;

create policy folders_insert_own on public.folders for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (parent_id is null or public.owns_folder(parent_id))
  );

create policy folders_update_own on public.folders for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (parent_id is null or public.owns_folder(parent_id))
  );

create policy documents_insert_own on public.documents for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (folder_id is null or public.owns_folder(folder_id))
  );

create policy documents_update_own on public.documents for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (folder_id is null or public.owns_folder(folder_id))
  );

-- ===== 0004_search_v2 =====
-- Better search. Safe to re-run (create or replace; same signature as 0002).
--
-- What changes:
--  * Every word you type must match somewhere, in any order:
--    "college marksheet" finds a document tagged College whose name contains Marksheet.
--  * A word can match: file name, description, file type (pdf, image, spreadsheet...),
--    a tag, or the name of the folder it is in OR ANY PARENT FOLDER ("education" finds
--    documents inside Education/Certificates).
--  * % and _ are matched literally. Documents in Trash are never returned.
-- SECURITY INVOKER: row level security still limits everything to the caller's own rows.
create or replace function public.search_documents(
  p_query text default null,
  p_file_type text default null,
  p_folder_id uuid default null,
  p_tag_id uuid default null,
  p_favorites_only boolean default false,
  p_limit int default 50,
  p_offset int default 0
)
returns setof public.documents
language sql stable security invoker set search_path = ''
as $$
  with recursive terms as (
    select '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
    from unnest(regexp_split_to_array(btrim(coalesce(p_query, '')), '\s+')) as t
    where t <> ''
  ),
  -- for each word: the folders whose name matches it, plus every folder below those
  folder_hits(pat, id) as (
    select t.pat, f.id from terms t join public.folders f on f.name ilike t.pat
    union
    select h.pat, c.id from folder_hits h join public.folders c on c.parent_id = h.id
  )
  select d.*
  from public.documents d
  where d.deleted_at is null
    and (p_file_type is null or d.file_type = p_file_type)
    and (p_folder_id is null or d.folder_id = p_folder_id)
    and (not p_favorites_only or d.is_favorite)
    and (p_tag_id is null or exists (
          select 1 from public.document_tags dt where dt.document_id = d.id and dt.tag_id = p_tag_id))
    and not exists (
      select 1 from terms t
      where not (
        d.file_name ilike t.pat
        or coalesce(d.description, '') ilike t.pat  -- coalesce: a NULL description must count as "no match", not "unknown"
        or d.file_type ilike t.pat
        or exists (select 1 from folder_hits h where h.pat = t.pat and h.id = d.folder_id)
        or exists (select 1 from public.document_tags dt join public.tags tg on tg.id = dt.tag_id
                   where dt.document_id = d.id and tg.name ilike t.pat)
      )
    )
  order by d.updated_at desc, d.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;
revoke execute on function public.search_documents(text, text, uuid, uuid, boolean, int, int) from public, anon;
grant execute on function public.search_documents(text, text, uuid, uuid, boolean, int, int) to authenticated;

-- Lets the app check that the database is up to date (shown in Settings, and as a banner when it is not).
-- Bump this number whenever a new migration adds something the app depends on.
create or replace function public.vault_schema_version()
returns int
language sql immutable security invoker set search_path = ''
as $$ select 4 $$;
revoke execute on function public.vault_schema_version() from public, anon;
grant execute on function public.vault_schema_version() to authenticated;

-- ===== 0005_phase6 =====
-- Phase 6: storage breakdown, avatar bucket, schema version 5.
-- Safe to run more than once.

-- Per-file-type usage, split into active files and files sitting in Trash.
create or replace function public.get_storage_breakdown()
returns table (
  file_type text,
  active_count bigint,
  active_bytes bigint,
  trash_count bigint,
  trash_bytes bigint
)
language sql stable security invoker set search_path = ''
as $$
  select
    d.file_type,
    count(*) filter (where d.deleted_at is null),
    coalesce(sum(d.file_size) filter (where d.deleted_at is null), 0)::bigint,
    count(*) filter (where d.deleted_at is not null),
    coalesce(sum(d.file_size) filter (where d.deleted_at is not null), 0)::bigint
  from public.documents d
  group by d.file_type;
$$;
revoke execute on function public.get_storage_breakdown() from public, anon;
grant execute on function public.get_storage_breakdown() to authenticated;

-- ---------------------------------------------------------------------------
-- Avatars: a second PRIVATE bucket. Objects live at {user_id}/{filename}.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_objects_select_own" on storage.objects;
drop policy if exists "avatars_objects_insert_own" on storage.objects;
drop policy if exists "avatars_objects_update_own" on storage.objects;
drop policy if exists "avatars_objects_delete_own" on storage.objects;

create policy "avatars_objects_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars_objects_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars_objects_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars_objects_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- profiles.avatar_url holds a storage path, and it must point inside the owner's own folder.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_path_check') then
    alter table public.profiles
      add constraint profiles_avatar_path_check
      check (avatar_url is null or avatar_url like user_id::text || '/%');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Schema version (the app compares this with REQUIRED_SCHEMA_VERSION).
-- ---------------------------------------------------------------------------
create or replace function public.vault_schema_version()
returns int language sql immutable set search_path = ''
as $$ select 5 $$;
revoke execute on function public.vault_schema_version() from public, anon;
grant execute on function public.vault_schema_version() to authenticated;

notify pgrst, 'reload schema';
