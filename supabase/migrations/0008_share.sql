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
