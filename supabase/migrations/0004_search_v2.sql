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
