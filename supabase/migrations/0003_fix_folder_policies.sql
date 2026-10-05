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
