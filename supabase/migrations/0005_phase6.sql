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
