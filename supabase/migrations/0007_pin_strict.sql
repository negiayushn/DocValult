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

