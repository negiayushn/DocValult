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
