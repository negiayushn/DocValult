-- Personal Vault: schema, Row Level Security, storage policies.
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to run once on a fresh project.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 100),
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 100), ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- folders (nested)
-- ---------------------------------------------------------------------------
create table public.folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name       text not null check (char_length(trim(name)) between 1 and 120 and name !~ '[/\\]'),
  parent_id  uuid references public.folders (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create index folders_user_parent_idx on public.folders (user_id, parent_id);
-- No two sibling folders with the same name (case-insensitive).
create unique index folders_unique_sibling_name_idx
  on public.folders (user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create trigger folders_updated_at before update on public.folders
  for each row execute function public.set_updated_at();

-- Block cycles: a folder cannot be moved into its own subtree.
create or replace function public.prevent_folder_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;
  if exists (
    with recursive ancestors as (
      select id, parent_id from public.folders where id = new.parent_id
      union all
      select f.id, f.parent_id from public.folders f join ancestors a on f.id = a.parent_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'A folder cannot be moved into its own subfolder' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger folders_prevent_cycle before insert or update of parent_id on public.folders
  for each row execute function public.prevent_folder_cycle();

-- ---------------------------------------------------------------------------
-- documents (soft delete via deleted_at)
-- ---------------------------------------------------------------------------
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  folder_id    uuid references public.folders (id) on delete set null,
  file_name    text not null check (char_length(trim(file_name)) between 1 and 255 and file_name !~ '[/\\]'),
  storage_path text not null unique,
  file_type    text not null,           -- coarse category: pdf, image, document, spreadsheet, presentation, text, archive
  mime_type    text not null,
  file_size    bigint not null check (file_size >= 0),
  description  text check (description is null or char_length(description) <= 2000),
  is_favorite  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  -- Storage objects must live under the owner's own prefix.
  check (storage_path like user_id::text || '/%')
);
create index documents_user_folder_idx   on public.documents (user_id, folder_id) where deleted_at is null;
create index documents_user_created_idx  on public.documents (user_id, created_at desc) where deleted_at is null;
create index documents_user_updated_idx  on public.documents (user_id, updated_at desc) where deleted_at is null;
create index documents_user_favorite_idx on public.documents (user_id) where is_favorite and deleted_at is null;
create index documents_user_trash_idx    on public.documents (user_id, deleted_at desc) where deleted_at is not null;
create index documents_user_type_idx     on public.documents (user_id, file_type) where deleted_at is null;
create index documents_file_name_trgm_idx on public.documents using gin (file_name extensions.gin_trgm_ops);
create index documents_folder_idx        on public.documents (folder_id);
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name       text not null check (char_length(trim(name)) between 1 and 50),
  created_at timestamptz not null default now()
);
create unique index tags_user_name_idx on public.tags (user_id, lower(name));

create table public.document_tags (
  document_id uuid not null references public.documents (id) on delete cascade,
  tag_id      uuid not null references public.tags (id) on delete cascade,
  primary key (document_id, tag_id)
);
create index document_tags_tag_idx on public.document_tags (tag_id);

-- ---------------------------------------------------------------------------
-- Row Level Security (enabled and FORCED on every table)
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.folders        enable row level security;
alter table public.documents      enable row level security;
alter table public.tags           enable row level security;
alter table public.document_tags  enable row level security;

alter table public.profiles       force row level security;
alter table public.folders        force row level security;
alter table public.documents      force row level security;
alter table public.tags           force row level security;
alter table public.document_tags  force row level security;

-- profiles: read/update own row. Insert is done by the signup trigger; delete cascades from auth.users.
create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- folders: owner only; a parent folder must also belong to the owner.
create policy folders_select_own on public.folders for select to authenticated
  using ((select auth.uid()) = user_id);
create policy folders_insert_own on public.folders for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (parent_id is null or exists (
      select 1 from public.folders p where p.id = parent_id and p.user_id = (select auth.uid())))
  );
create policy folders_update_own on public.folders for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (parent_id is null or exists (
      select 1 from public.folders p where p.id = parent_id and p.user_id = (select auth.uid())))
  );
create policy folders_delete_own on public.folders for delete to authenticated
  using ((select auth.uid()) = user_id);

-- documents: owner only; target folder must also belong to the owner.
create policy documents_select_own on public.documents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy documents_insert_own on public.documents for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (folder_id is null or exists (
      select 1 from public.folders f where f.id = folder_id and f.user_id = (select auth.uid())))
  );
create policy documents_update_own on public.documents for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (folder_id is null or exists (
      select 1 from public.folders f where f.id = folder_id and f.user_id = (select auth.uid())))
  );
create policy documents_delete_own on public.documents for delete to authenticated
  using ((select auth.uid()) = user_id);

-- tags: owner only.
create policy tags_select_own on public.tags for select to authenticated
  using ((select auth.uid()) = user_id);
create policy tags_insert_own on public.tags for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy tags_update_own on public.tags for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy tags_delete_own on public.tags for delete to authenticated
  using ((select auth.uid()) = user_id);

-- document_tags: both the document and the tag must belong to the caller.
create policy document_tags_select_own on public.document_tags for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())));
create policy document_tags_insert_own on public.document_tags for insert to authenticated
  with check (
    exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid()))
    and exists (select 1 from public.tags t where t.id = tag_id and t.user_id = (select auth.uid()))
  );
create policy document_tags_delete_own on public.document_tags for delete to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())));

-- Table privileges: signed-in users only. Anonymous visitors get nothing.
revoke all on public.profiles, public.folders, public.documents, public.tags, public.document_tags from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.folders, public.documents, public.tags to authenticated;
grant select, insert, delete on public.document_tags to authenticated;

-- ---------------------------------------------------------------------------
-- Folder deletion: contents go to Trash instead of being lost.
-- Runs as the caller (security invoker), so RLS still applies.
-- ---------------------------------------------------------------------------
create or replace function public.delete_folder(p_folder_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  with recursive tree as (
    select id from public.folders where id = p_folder_id
    union all
    select f.id from public.folders f join tree t on f.parent_id = t.id
  )
  update public.documents
     set deleted_at = now()
   where folder_id in (select id from tree) and deleted_at is null;

  delete from public.folders where id = p_folder_id;
end;
$$;
revoke execute on function public.delete_folder(uuid) from public, anon;
grant execute on function public.delete_folder(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: one PRIVATE bucket. Objects live at {user_id}/{document_id}/{filename}.
-- Keep allowed_mime_types and file_size_limit in sync with src/lib/config.ts.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 52428800,
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/zip', 'application/x-zip-compressed'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "documents_objects_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_objects_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_objects_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_objects_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
