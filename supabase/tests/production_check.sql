-- Personal Vault: READ-ONLY production check. Safe to run in the Supabase SQL editor; it changes nothing.
-- Every row should say PASS. Any FAIL needs fixing before you store real documents.
with
tables as (
  select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
),
checks as (
  select 'RLS enabled + forced on public.' || relname as name, (rls and forced) as ok from tables
  union all select 'anon has no grants on public tables',
    not exists (select 1 from information_schema.role_table_grants where table_schema='public' and grantee='anon')
  union all select 'documents bucket exists and is private',
    exists (select 1 from storage.buckets where id='documents' and not public)
  union all select 'documents bucket has a size limit and MIME allowlist',
    exists (select 1 from storage.buckets where id='documents' and file_size_limit is not null and allowed_mime_types is not null)
  union all select 'avatars bucket exists and is private',
    exists (select 1 from storage.buckets where id='avatars' and not public)
  union all select 'no other public buckets',
    not exists (select 1 from storage.buckets where public)
  union all select 'storage policies for documents: select/insert/update/delete (4)',
    (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'documents_objects_%') = 4
  union all select 'storage policies for avatars: select/insert/update/delete (4)',
    (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'avatars_objects_%') = 4
  union all select 'no storage policy is open to anon/public',
    not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and roles && array['anon','public']::name[] and (policyname like 'documents_%' or policyname like 'avatars_%'))
  union all select 'every public function pins search_path: ' || p.proname,
    coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.prokind='f'
  union all select 'anon cannot execute public.' || p.proname,
    not has_function_privilege('anon', p.oid, 'execute')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname not in ('handle_new_user','set_updated_at','touch_updated_at')
    and not exists (select 1 from pg_trigger t where t.tgfoid = p.oid)
  union all select 'database schema version is at least 5',
    (select public.vault_schema_version()) >= 5
)
select case when ok then 'PASS' else 'FAIL' end as result, name from checks order by ok, name;
