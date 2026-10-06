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
