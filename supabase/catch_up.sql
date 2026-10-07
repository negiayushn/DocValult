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

-- ===== 0006_pin =====
-- Phase 8: 6-digit PIN lock.
--   * The PIN is stored only as a bcrypt hash in a table no client can read or write directly.
--   * All checks run in SECURITY DEFINER functions with attempt counting and lockout (5 wrong tries = 15 minutes).
--   * After a correct PIN the database remembers "PIN verified" for 5 minutes. Destructive actions (move to Trash,
--     delete forever, delete a folder, remove files from storage) are refused by the database outside that window,
--     so they stay protected even if someone calls the API directly with a stolen session.
-- Safe to run more than once.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.user_pins (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  pin_hash           text not null,
  failed_attempts    int  not null default 0,
  locked_until       timestamptz,
  sensitive_until    timestamptz,
  lock_after_minutes int  not null default 5 check (lock_after_minutes in (0, 1, 5, 15, 30, 60)),
  updated_at         timestamptz not null default now()
);
alter table public.user_pins enable row level security;
alter table public.user_pins force row level security;
-- No policies and no grants: only the functions below can touch this table.
revoke all on public.user_pins from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Is the caller allowed to do a destructive action right now?
-- True when no user is attached (admin / cascade deletes), when the user has no PIN, or when the PIN was
-- verified in the last 5 minutes.
-- ---------------------------------------------------------------------------
create or replace function public.pin_recent()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then true
    when not exists (select 1 from public.user_pins p where p.user_id = (select auth.uid())) then true
    else exists (select 1 from public.user_pins p where p.user_id = (select auth.uid()) and p.sensitive_until > now())
  end;
$$;
revoke execute on function public.pin_recent() from public, anon;
grant execute on function public.pin_recent() to authenticated;

drop function if exists public.pin_status();
create function public.pin_status()
returns table (has_pin boolean, locked_seconds int, lock_after_minutes int, verified_seconds int)
language plpgsql stable security definer set search_path = ''
as $$
declare r public.user_pins;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into r from public.user_pins where user_id = auth.uid();
  if not found then return query select false, 0, 5, 0; return; end if;
  return query select true,
    greatest(0, ceil(extract(epoch from (coalesce(r.locked_until, now()) - now()))))::int,
    r.lock_after_minutes,
    greatest(0, ceil(extract(epoch from (coalesce(r.sensitive_until, now()) - now()))))::int;
end;
$$;
revoke execute on function public.pin_status() from public, anon;
grant execute on function public.pin_status() to authenticated;

-- Shared check. Returns (ok, attempts_left, locked_seconds). NEVER raises on a wrong PIN: the failed-attempt
-- counter must be saved, and raising would roll it back.
create or replace function public._pin_check(p_user uuid, p_pin text, p_grant_window boolean)
returns table (ok boolean, attempts_left int, locked_seconds int)
language plpgsql security definer set search_path = ''
as $$
declare r public.user_pins; fails int;
begin
  select * into r from public.user_pins where user_id = p_user for update;
  if not found then return query select true, 5, 0; return; end if;

  if r.locked_until is not null and r.locked_until > now() then
    return query select false, 0, ceil(extract(epoch from (r.locked_until - now())))::int; return;
  end if;

  if p_pin is not null and p_pin ~ '^[0-9]{6}$' and extensions.crypt(p_pin, r.pin_hash) = r.pin_hash then
    update public.user_pins
       set failed_attempts = 0, locked_until = null,
           sensitive_until = case when p_grant_window then now() + interval '5 minutes' else sensitive_until end
     where user_id = p_user;
    return query select true, 5, 0; return;
  end if;

  fails := r.failed_attempts + 1;
  if fails % 5 = 0 then
    update public.user_pins set failed_attempts = fails, locked_until = now() + interval '15 minutes', sensitive_until = null where user_id = p_user;
    return query select false, 0, 900; return;
  end if;
  update public.user_pins set failed_attempts = fails where user_id = p_user;
  return query select false, 5 - (fails % 5), 0;
end;
$$;
revoke execute on function public._pin_check(uuid, text, boolean) from public, anon, authenticated;

create or replace function public.verify_pin(p_pin text)
returns table (ok boolean, attempts_left int, locked_seconds int)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  return query select * from public._pin_check(auth.uid(), p_pin, true);
end;
$$;
revoke execute on function public.verify_pin(text) from public, anon;
grant execute on function public.verify_pin(text) to authenticated;

-- Weak PINs are refused: all the same digit, or a straight run up or down.
create or replace function public._pin_is_valid(p_pin text)
returns boolean language sql immutable set search_path = ''
as $$
  select p_pin ~ '^[0-9]{6}$'
     and p_pin !~ '^(.)\1{5}$'
     and p_pin not in ('012345','123456','234567','345678','456789','567890','987654','876543','765432','654321','543210','098765');
$$;

revoke execute on function public._pin_is_valid(text) from public, anon, authenticated;

-- First PIN. Only allowed while no PIN exists (changing one needs the current PIN: change_pin).
create or replace function public.set_pin(p_new text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not public._pin_is_valid(p_new) then raise exception 'PIN_INVALID'; end if;
  if exists (select 1 from public.user_pins where user_id = auth.uid()) then raise exception 'PIN_EXISTS'; end if;
  insert into public.user_pins (user_id, pin_hash, sensitive_until)
  values (auth.uid(), extensions.crypt(p_new, extensions.gen_salt('bf', 10)), now() + interval '5 minutes');
end;
$$;
revoke execute on function public.set_pin(text) from public, anon;
grant execute on function public.set_pin(text) to authenticated;

create or replace function public.change_pin(p_current text, p_new text)
returns table (ok boolean, attempts_left int, locked_seconds int)
language plpgsql security definer set search_path = ''
as $$
declare res record;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not public._pin_is_valid(p_new) then raise exception 'PIN_INVALID'; end if;
  select * into res from public._pin_check(auth.uid(), p_current, true);
  if res.ok then
    update public.user_pins
       set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), updated_at = now()
     where user_id = auth.uid();
  end if;
  return query select res.ok, res.attempts_left, res.locked_seconds;
end;
$$;
revoke execute on function public.change_pin(text, text) from public, anon;
grant execute on function public.change_pin(text, text) to authenticated;

create or replace function public.remove_pin(p_current text)
returns table (ok boolean, attempts_left int, locked_seconds int)
language plpgsql security definer set search_path = ''
as $$
declare res record;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into res from public._pin_check(auth.uid(), p_current, false);
  if res.ok then delete from public.user_pins where user_id = auth.uid(); end if;
  return query select res.ok, res.attempts_left, res.locked_seconds;
end;
$$;
revoke execute on function public.remove_pin(text) from public, anon;
grant execute on function public.remove_pin(text) to authenticated;

-- Forgot the PIN: allowed only right after typing the account PASSWORD (a password sign-in in the last 2 minutes,
-- read from the signed token). A stolen older session cannot use this to clear the PIN.
create or replace function public.reset_pin_after_login()
returns void
language plpgsql security definer set search_path = ''
as $$
declare ts bigint;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select max((e ->> 'timestamp')::bigint) into ts
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
   where e ->> 'method' = 'password';
  if ts is null or to_timestamp(ts) < now() - interval '2 minutes' then raise exception 'RECENT_LOGIN_REQUIRED'; end if;
  delete from public.user_pins where user_id = auth.uid();
end;
$$;
revoke execute on function public.reset_pin_after_login() from public, anon;
grant execute on function public.reset_pin_after_login() to authenticated;

-- Auto-lock timeout (minutes of inactivity; 0 = lock every time the app is opened). Loosening it needs a fresh PIN.
create or replace function public.set_pin_lock_timeout(p_minutes int)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_minutes not in (0, 1, 5, 15, 30, 60) then raise exception 'PIN_INVALID'; end if;
  if not public.pin_recent() then raise exception 'PIN_REQUIRED'; end if;
  update public.user_pins set lock_after_minutes = p_minutes, updated_at = now() where user_id = auth.uid();
end;
$$;
revoke execute on function public.set_pin_lock_timeout(int) from public, anon;
grant execute on function public.set_pin_lock_timeout(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Enforcement: destructive changes need a recent PIN.
-- ---------------------------------------------------------------------------
create or replace function public.guard_pin()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if not public.pin_recent() then raise exception 'PIN_REQUIRED' using errcode = 'P0001'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists documents_guard_trash on public.documents;
create trigger documents_guard_trash before update of deleted_at on public.documents
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.guard_pin();

drop trigger if exists documents_guard_delete on public.documents;
create trigger documents_guard_delete before delete on public.documents
  for each row execute function public.guard_pin();

drop trigger if exists folders_guard_delete on public.folders;
create trigger folders_guard_delete before delete on public.folders
  for each row execute function public.guard_pin();

-- Storage: an object that belongs to a document can only be removed with a recent PIN. Objects with no document
-- row (failed or cancelled uploads) can still be cleaned up freely.
drop policy if exists "documents_objects_delete_own" on storage.objects;
create policy "documents_objects_delete_own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      public.pin_recent()
      or not exists (select 1 from public.documents d where d.storage_path = name)
    )
  );

create or replace function public.vault_schema_version()
returns int language sql immutable set search_path = ''
as $$ select 6 $$;
revoke execute on function public.vault_schema_version() from public, anon;
grant execute on function public.vault_schema_version() to authenticated;

notify pgrst, 'reload schema';

-- ===== 0007_pin_strict =====
-- Phase 8b: stricter PIN rules for permanent deletes, and "Lock now" really ends the unlocked window.
-- Safe to run more than once. Needs 0006.
--
--   Move to Trash, change settings : PIN entered in the last 5 minutes (unchanged)
--   Delete forever, Empty Trash, Delete folder, remove files from storage, Delete account:
--                                    PIN entered in the last 30 seconds ("strict" window)
--   Lock now / auto-lock           : ends both windows on the server

alter table public.user_pins add column if not exists strict_until timestamptz;

create or replace function public.pin_recent_strict()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then true
    when not exists (select 1 from public.user_pins p where p.user_id = (select auth.uid())) then true
    else exists (select 1 from public.user_pins p where p.user_id = (select auth.uid()) and p.strict_until > now())
  end;
$$;
revoke execute on function public.pin_recent_strict() from public, anon;
grant execute on function public.pin_recent_strict() to authenticated;

drop function if exists public.pin_status();
create function public.pin_status()
returns table (has_pin boolean, locked_seconds int, lock_after_minutes int, verified_seconds int, strict_seconds int)
language plpgsql stable security definer set search_path = ''
as $$
declare r public.user_pins;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into r from public.user_pins where user_id = auth.uid();
  if not found then return query select false, 0, 5, 0, 0; return; end if;
  return query select true,
    greatest(0, ceil(extract(epoch from (coalesce(r.locked_until, now()) - now()))))::int,
    r.lock_after_minutes,
    greatest(0, ceil(extract(epoch from (coalesce(r.sensitive_until, now()) - now()))))::int,
    greatest(0, ceil(extract(epoch from (coalesce(r.strict_until, now()) - now()))))::int;
end;
$$;
revoke execute on function public.pin_status() from public, anon;
grant execute on function public.pin_status() to authenticated;

create or replace function public._pin_check(p_user uuid, p_pin text, p_grant_window boolean)
returns table (ok boolean, attempts_left int, locked_seconds int)
language plpgsql security definer set search_path = ''
as $$
declare r public.user_pins; fails int;
begin
  select * into r from public.user_pins where user_id = p_user for update;
  if not found then return query select true, 5, 0; return; end if;

  if r.locked_until is not null and r.locked_until > now() then
    return query select false, 0, ceil(extract(epoch from (r.locked_until - now())))::int; return;
  end if;

  if p_pin is not null and p_pin ~ '^[0-9]{6}$' and extensions.crypt(p_pin, r.pin_hash) = r.pin_hash then
    update public.user_pins
       set failed_attempts = 0, locked_until = null,
           sensitive_until = case when p_grant_window then now() + interval '5 minutes' else sensitive_until end,
           strict_until    = case when p_grant_window then now() + interval '30 seconds' else strict_until end
     where user_id = p_user;
    return query select true, 5, 0; return;
  end if;

  fails := r.failed_attempts + 1;
  if fails % 5 = 0 then
    update public.user_pins
       set failed_attempts = fails, locked_until = now() + interval '15 minutes', sensitive_until = null, strict_until = null
     where user_id = p_user;
    return query select false, 0, 900; return;
  end if;
  update public.user_pins set failed_attempts = fails where user_id = p_user;
  return query select false, 5 - (fails % 5), 0;
end;
$$;
revoke execute on function public._pin_check(uuid, text, boolean) from public, anon, authenticated;

create or replace function public.set_pin(p_new text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not public._pin_is_valid(p_new) then raise exception 'PIN_INVALID'; end if;
  if exists (select 1 from public.user_pins where user_id = auth.uid()) then raise exception 'PIN_EXISTS'; end if;
  insert into public.user_pins (user_id, pin_hash, sensitive_until, strict_until)
  values (auth.uid(), extensions.crypt(p_new, extensions.gen_salt('bf', 10)), now() + interval '5 minutes', now() + interval '30 seconds');
end;
$$;
revoke execute on function public.set_pin(text) from public, anon;
grant execute on function public.set_pin(text) to authenticated;

-- Ends both windows right now (Lock button, auto-lock, sign out).
create or replace function public.pin_lock_now()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  update public.user_pins set sensitive_until = null, strict_until = null where user_id = auth.uid();
end;
$$;
revoke execute on function public.pin_lock_now() from public, anon;
grant execute on function public.pin_lock_now() to authenticated;

-- Guard for permanent deletes uses the strict window; Move to Trash keeps the normal one.
create or replace function public.guard_pin_strict()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if not public.pin_recent_strict() then raise exception 'PIN_REQUIRED' using errcode = 'P0001'; end if;
  return old;
end;
$$;

drop trigger if exists documents_guard_delete on public.documents;
create trigger documents_guard_delete before delete on public.documents
  for each row execute function public.guard_pin_strict();

drop trigger if exists folders_guard_delete on public.folders;
create trigger folders_guard_delete before delete on public.folders
  for each row execute function public.guard_pin_strict();

drop policy if exists "documents_objects_delete_own" on storage.objects;
create policy "documents_objects_delete_own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      public.pin_recent_strict()
      or not exists (select 1 from public.documents d where d.storage_path = name)
    )
  );

create or replace function public.vault_schema_version()
returns int language sql immutable set search_path = ''
as $$ select 7 $$;
revoke execute on function public.vault_schema_version() from public, anon;
grant execute on function public.vault_schema_version() to authenticated;

notify pgrst, 'reload schema';

-- ===== 0008_share =====
-- Phase 9: short, cancellable share links. Safe to run more than once. Needs 0006 (PIN) first.
--
-- A share link is a short random code (shown as https://your-site/s/<code>). The code row says which of YOUR
-- documents it opens and until when. Strangers open it through the `open-share` Edge Function, which checks
-- the row and hands out a one-minute signed URL. Browsers and anonymous visitors get no direct database or
-- storage access, so the rest of the vault stays sealed.

create table if not exists public.share_links (
  code        text primary key check (code ~ '^[A-Za-z0-9]{10}$'),
  user_id     uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists share_links_user_doc_idx on public.share_links (user_id, document_id);
create index if not exists share_links_expires_idx on public.share_links (expires_at);

alter table public.share_links enable row level security;
alter table public.share_links force row level security;
revoke all on public.share_links from public, anon, authenticated;
grant select on public.share_links to authenticated;

drop policy if exists "share_links_select_own" on public.share_links;
create policy "share_links_select_own" on public.share_links for select to authenticated
  using (user_id = (select auth.uid()));
-- No insert / update / delete policies: links are only made and cancelled through the functions below.

create or replace function public.create_share_link(p_document uuid, p_seconds int)
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  bytes bytea; c text; i int; tries int := 0; exp timestamptz;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not public.pin_recent() then raise exception 'PIN_REQUIRED' using errcode = 'P0001'; end if;
  if p_seconds is null or p_seconds < 60 or p_seconds > 604800 then raise exception 'SHARE_INVALID_EXPIRY'; end if;
  if not exists (select 1 from public.documents d where d.id = p_document and d.user_id = uid and d.deleted_at is null) then
    raise exception 'SHARE_NOT_FOUND';
  end if;

  delete from public.share_links s where s.user_id = uid and s.expires_at < now();
  if (select count(*) from public.share_links s where s.user_id = uid) >= 100 then raise exception 'SHARE_TOO_MANY'; end if;

  exp := now() + make_interval(secs => p_seconds);
  loop
    bytes := extensions.gen_random_bytes(10);
    c := '';
    for i in 0..9 loop
      c := c || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    begin
      insert into public.share_links as s (code, user_id, document_id, expires_at) values (c, uid, p_document, exp);
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise exception 'SHARE_RETRY'; end if;
    end;
  end loop;
  return query select c, exp;
end;
$$;
revoke execute on function public.create_share_link(uuid, int) from public, anon;
grant execute on function public.create_share_link(uuid, int) to authenticated;

create or replace function public.revoke_share_link(p_code text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  delete from public.share_links s where s.code = p_code and s.user_id = auth.uid();
end;
$$;
revoke execute on function public.revoke_share_link(text) from public, anon;
grant execute on function public.revoke_share_link(text) to authenticated;

create or replace function public.vault_schema_version()
returns int language sql immutable set search_path = ''
as $$ select 8 $$;
revoke execute on function public.vault_schema_version() from public, anon;
grant execute on function public.vault_schema_version() to authenticated;

notify pgrst, 'reload schema';
