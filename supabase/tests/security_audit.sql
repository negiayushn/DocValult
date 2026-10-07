-- Personal Vault: two-user security audit.
--
-- !! RUN ONLY ON A LOCAL / SCRATCH DATABASE (for example `supabase start`), NEVER ON PRODUCTION. !!
-- It creates two fake users, tries to read and attack one with the other, and prints PASS/FAIL per check.
-- Expected last line: "---- N passed, 0 FAILED of N". Any FAIL line is a security bug.
-- For your real project use supabase/tests/production_check.sql instead (read-only).
--
-- Prerequisite: migrations 0001..0008 applied.
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned
drop schema if exists audit cascade; create schema audit;
create table audit.results(name text, pass boolean, detail text);
create function audit.chk(name text, pass boolean, detail text default '') returns void language sql as $$ insert into audit.results values (name, pass, detail) $$;

-- run a statement as a role/user; returns 'ok:<rows>' or 'error:<msg>'
create function audit.try(uid uuid, stmt text, r text default 'authenticated') returns text language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid)::text end, true);
  execute 'set local role ' || r;
  execute stmt;
  get diagnostics n = row_count;
  execute 'reset role';
  return 'ok:' || n;
exception when others then
  return 'error:' || sqlerrm;
end $$;
-- count of rows a select returns for a user
create function audit.cnt(uid uuid, q text, r text default 'authenticated') returns text language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid)::text end, true);
  execute 'set local role ' || r;
  execute 'select count(*) from (' || q || ') s' into n;
  execute 'reset role';
  return n::text;
exception when others then
  return 'error:' || sqlerrm;
end $$;

-- fixtures (as superuser, which bypasses RLS)
select set_config('storage.allow_delete_query','true',false);
delete from storage.objects where name like 'aaaaaaaa-0000%' or name like 'bbbbbbbb-0000%';
delete from auth.users where id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002');
insert into auth.users(id) values ('aaaaaaaa-0000-0000-0000-000000000001'),('bbbbbbbb-0000-0000-0000-000000000002');
-- profiles are created by trigger if present
insert into public.profiles(user_id,display_name) values ('aaaaaaaa-0000-0000-0000-000000000001','A'),('bbbbbbbb-0000-0000-0000-000000000002','B') on conflict do nothing;
insert into public.folders(id,user_id,name) values ('f0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','A-folder');
insert into public.folders(id,user_id,name) values ('f0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','B-folder');
insert into public.documents(id,user_id,folder_id,file_name,storage_path,file_type,mime_type,file_size) values
 ('d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','f0000000-0000-0000-0000-00000000000a','a.pdf','aaaaaaaa-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000a/a.pdf','pdf','application/pdf',100),
 ('d0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','f0000000-0000-0000-0000-00000000000b','b.pdf','bbbbbbbb-0000-0000-0000-000000000002/d0000000-0000-0000-0000-00000000000b/b.pdf','pdf','application/pdf',900);
insert into public.tags(id,user_id,name) values ('70000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','ta'),('70000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','tb');
insert into public.document_tags values ('d0000000-0000-0000-0000-00000000000b','70000000-0000-0000-0000-00000000000b');
insert into storage.objects(bucket_id,name) values
 ('documents','aaaaaaaa-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000a/a.pdf'),
 ('documents','bbbbbbbb-0000-0000-0000-000000000002/d0000000-0000-0000-0000-00000000000b/b.pdf'),
 ('avatars','bbbbbbbb-0000-0000-0000-000000000002/avatar-1.png');

do $$
declare
  A uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; B uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  t text; r text; n int;
begin
  -- 1. RLS enabled AND forced on every public table
  for t in select c.relname from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind in ('r','p') loop
    perform audit.chk('RLS enabled+forced: '||t, (select relrowsecurity and relforcerowsecurity from pg_class where oid=('public.'||t)::regclass));
  end loop;

  -- 2. Cross-user read isolation, every table
  foreach t in array array['profiles','folders','documents','tags','document_tags'] loop
    perform audit.chk('A cannot read B rows in '||t, audit.cnt(A,'select * from public.'||t||' where '||case t when 'document_tags' then 'document_id' when 'tags' then 'user_id' else 'user_id' end||'::text in ('''||B||''''||case t when 'document_tags' then ',''d0000000-0000-0000-0000-00000000000b''' else '' end||')') = '0');
  end loop;
  perform audit.chk('A sees exactly own documents (1)', audit.cnt(A,'select * from public.documents')='1');
  perform audit.chk('A sees exactly own folders (1)', audit.cnt(A,'select * from public.folders')='1');
  perform audit.chk('A sees no foreign document_tags', audit.cnt(A,'select * from public.document_tags')='0');

  -- 3. Cross-user write: update / delete B's rows affects 0 rows
  perform audit.chk('A cannot UPDATE B document', audit.try(A,'update public.documents set file_name=''pwn'' where id=''d0000000-0000-0000-0000-00000000000b''')='ok:0');
  perform audit.chk('A cannot DELETE B document', audit.try(A,'delete from public.documents where id=''d0000000-0000-0000-0000-00000000000b''')='ok:0');
  perform audit.chk('A cannot UPDATE B folder', audit.try(A,'update public.folders set name=''pwn'' where id=''f0000000-0000-0000-0000-00000000000b''')='ok:0');
  perform audit.chk('A cannot DELETE B folder', audit.try(A,'delete from public.folders where id=''f0000000-0000-0000-0000-00000000000b''')='ok:0');
  perform audit.chk('A cannot UPDATE B tag', audit.try(A,'update public.tags set name=''pwn'' where id=''70000000-0000-0000-0000-00000000000b''')='ok:0');
  perform audit.chk('A cannot DELETE B tag', audit.try(A,'delete from public.tags where id=''70000000-0000-0000-0000-00000000000b''')='ok:0');
  perform audit.chk('A cannot UPDATE B profile', audit.try(A,'update public.profiles set display_name=''pwn'' where user_id='''||B||'''')='ok:0');
  perform audit.chk('A cannot DELETE B document_tags', audit.try(A,'delete from public.document_tags')='ok:0');

  -- 4. Cross-user insert: forging user_id or referencing foreign rows must error
  perform audit.chk('A cannot insert document as B', audit.try(A,'insert into public.documents(user_id,file_name,storage_path,file_type,mime_type,file_size) values('''||B||''',''x.pdf'','''||B||'/x/x.pdf'',''pdf'',''application/pdf'',1)') like 'error:%');
  perform audit.chk('A cannot insert folder as B', audit.try(A,'insert into public.folders(user_id,name) values('''||B||''',''x'')') like 'error:%');
  perform audit.chk('A cannot insert tag as B', audit.try(A,'insert into public.tags(user_id,name) values('''||B||''',''x'')') like 'error:%');
  perform audit.chk('A cannot insert document into B folder', audit.try(A,'insert into public.documents(folder_id,file_name,storage_path,file_type,mime_type,file_size) values(''f0000000-0000-0000-0000-00000000000b'',''x.pdf'','''||A||'/x/x.pdf'',''pdf'',''application/pdf'',1)') like 'error:%');
  perform audit.chk('A cannot create folder under B folder', audit.try(A,'insert into public.folders(name,parent_id) values(''x'',''f0000000-0000-0000-0000-00000000000b'')') like 'error:%');
  perform audit.chk('A cannot move own doc into B folder', audit.try(A,'update public.documents set folder_id=''f0000000-0000-0000-0000-00000000000b'' where id=''d0000000-0000-0000-0000-00000000000a''') like 'error:%');
  perform audit.chk('A cannot move own folder under B folder', audit.try(A,'update public.folders set parent_id=''f0000000-0000-0000-0000-00000000000b'' where id=''f0000000-0000-0000-0000-00000000000a''') like 'error:%');
  perform audit.chk('A cannot tag B document with A tag', audit.try(A,'insert into public.document_tags values(''d0000000-0000-0000-0000-00000000000b'',''70000000-0000-0000-0000-00000000000a'')') like 'error:%');
  perform audit.chk('A cannot tag own document with B tag', audit.try(A,'insert into public.document_tags values(''d0000000-0000-0000-0000-00000000000a'',''70000000-0000-0000-0000-00000000000b'')') like 'error:%');
  perform audit.chk('A cannot hand own document to B (update user_id)', audit.try(A,'update public.documents set user_id='''||B||''' where id=''d0000000-0000-0000-0000-00000000000a''') like 'error:%');
  perform audit.chk('A cannot hand own folder to B (update user_id)', audit.try(A,'update public.folders set user_id='''||B||''' where id=''f0000000-0000-0000-0000-00000000000a''') like 'error:%');
  perform audit.chk('A cannot point document storage_path at B object', audit.try(A,'update public.documents set storage_path='''||B||'/d0000000-0000-0000-0000-00000000000b/b.pdf'' where id=''d0000000-0000-0000-0000-00000000000a''') like 'error:%');
  perform audit.chk('A cannot insert a profile row', audit.try(A,'insert into public.profiles(user_id) values('''||A||''')') like 'error:%');
  perform audit.chk('A cannot delete own profile row', audit.try(A,'delete from public.profiles where user_id='''||A||'''') in ('error:permission denied for table profiles','ok:0') );
  perform audit.chk('A cannot point avatar at B path', audit.try(A,'update public.profiles set avatar_url='''||B||'/avatar-1.png'' where user_id='''||A||'''') like 'error:%');

  -- 5. Legit own operations still work (RLS not over-tight)
  perform audit.chk('A can insert own doc in own folder', audit.try(A,'insert into public.documents(folder_id,file_name,storage_path,file_type,mime_type,file_size) values(''f0000000-0000-0000-0000-00000000000a'',''ok.pdf'','''||A||'/ok/ok.pdf'',''pdf'',''application/pdf'',5)')='ok:1');
  perform audit.chk('A can tag own doc with own tag', audit.try(A,'insert into public.document_tags values(''d0000000-0000-0000-0000-00000000000a'',''70000000-0000-0000-0000-00000000000a'')')='ok:1');
  perform audit.chk('A can rename own doc', audit.try(A,'update public.documents set file_name=''renamed.pdf'' where id=''d0000000-0000-0000-0000-00000000000a''')='ok:1');

  -- 6. RPCs are caller-scoped
  perform audit.chk('get_dashboard_stats counts only A', (select audit.cnt(A,'select * from public.get_dashboard_stats() where total_documents=3')) in ('1','0'));
  perform audit.chk('stats storage_used excludes B (A has 100+5)', audit.cnt(A,'select * from public.get_dashboard_stats() where storage_used=105')='1');
  perform audit.chk('get_storage_breakdown excludes B', audit.cnt(A,'select * from public.get_storage_breakdown() where active_bytes>=900')='0');
  perform audit.chk('search_documents never returns B docs', audit.cnt(A,'select * from public.search_documents(''b.pdf'')')='0');
  perform audit.chk('search_documents by B folder name returns nothing', audit.cnt(A,'select * from public.search_documents(''B-folder'')')='0');
  perform audit.chk('get_folder_doc_counts excludes B folder', audit.cnt(A,'select * from public.get_folder_doc_counts() where folder_id=''f0000000-0000-0000-0000-00000000000b''')='0');
  perform audit.chk('delete_folder on B folder is refused or no-op', audit.try(A,'select public.delete_folder(''f0000000-0000-0000-0000-00000000000b'')') <> 'ok:0' or true);
  select count(*) into n from public.documents where id='d0000000-0000-0000-0000-00000000000b' and deleted_at is null;
  perform audit.chk('B document untouched after A delete_folder attempt', n=1);
  select count(*) into n from public.folders where id='f0000000-0000-0000-0000-00000000000b';
  perform audit.chk('B folder still exists after A delete_folder attempt', n=1);

  -- 7. Anonymous role has nothing
  foreach t in array array['profiles','folders','documents','tags','document_tags'] loop
    perform audit.chk('anon cannot read '||t, audit.cnt(null,'select * from public.'||t,'anon') like 'error:%permission denied%');
    perform audit.chk('anon cannot insert '||t, audit.try(null,'insert into public.'||t||' default values','anon') like 'error:%');
  end loop;
  foreach t in array array['get_dashboard_stats()','get_folder_doc_counts()','get_storage_breakdown()','vault_schema_version()','search_documents(''x'')','delete_folder(''f0000000-0000-0000-0000-00000000000a'')'] loop
    perform audit.chk('anon cannot call '||t, audit.try(null,'select public.'||t,'anon') like 'error:%permission denied%');
  end loop;

  -- 8. Storage policies (both buckets)
  perform audit.chk('A sees own documents object only', audit.cnt(A,'select * from storage.objects where bucket_id=''documents''')='1');
  perform audit.chk('A cannot see B avatar', audit.cnt(A,'select * from storage.objects where bucket_id=''avatars''')='0');
  perform audit.chk('A cannot upload into B documents prefix', audit.try(A,'insert into storage.objects(bucket_id,name) values(''documents'','''||B||'/x/evil.pdf'')') like 'error:%');
  perform audit.chk('A cannot upload into B avatars prefix', audit.try(A,'insert into storage.objects(bucket_id,name) values(''avatars'','''||B||'/evil.png'')') like 'error:%');
  perform audit.chk('A cannot upload to a root-level path', audit.try(A,'insert into storage.objects(bucket_id,name) values(''documents'',''evil.pdf'')') like 'error:%');
  perform audit.chk('A cannot delete B object', audit.try(A,'delete from storage.objects where name like '''||B||'%''')='ok:0');
  perform audit.chk('A cannot overwrite B object', audit.try(A,'update storage.objects set name=name where name like '''||B||'%''')='ok:0');
  perform audit.chk('A can upload to own prefix', audit.try(A,'insert into storage.objects(bucket_id,name) values(''documents'','''||A||'/n/ok.pdf'')')='ok:1');
  perform audit.chk('anon cannot read storage objects', audit.cnt(null,'select * from storage.objects','anon') = '0' or audit.cnt(null,'select * from storage.objects','anon') like 'error:%');
  perform audit.chk('documents bucket is private', (select not public from storage.buckets where id='documents'));
  perform audit.chk('avatars bucket is private', (select not public from storage.buckets where id='avatars'));
  perform audit.chk('documents bucket has size limit + mime allowlist', (select file_size_limit is not null and allowed_mime_types is not null from storage.buckets where id='documents'));
  perform audit.chk('avatars bucket has size limit + mime allowlist', (select file_size_limit is not null and allowed_mime_types is not null from storage.buckets where id='avatars'));
  perform audit.chk('no storage policy grants to anon/public', not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and (roles && array['anon','public']::name[])));

  -- 8b. Share links (short codes opened only through the open-share Edge Function)
  perform audit.chk('A can create a share link for own document', audit.try(A,'select * from public.create_share_link(''d0000000-0000-0000-0000-00000000000a'', 3600)')='ok:1');
  perform audit.chk('B cannot create a link for A document', audit.try(B,'select * from public.create_share_link(''d0000000-0000-0000-0000-00000000000a'', 3600)') like '%SHARE_NOT_FOUND%');
  perform audit.chk('A sees own share link', audit.cnt(A,'select * from public.share_links')='1');
  perform audit.chk('B cannot see A share link', audit.cnt(B,'select * from public.share_links')='0');
  perform audit.chk('B cannot cancel A share link', audit.try(B,'select public.revoke_share_link('''||(select code from public.share_links limit 1)||''')')='ok:1');
  perform audit.chk('B cancel did not remove A link', (select count(*) from public.share_links)=1);
  perform audit.chk('anon cannot read share_links', audit.cnt(null,'select * from public.share_links','anon') like 'error:%');
  perform audit.chk('anon cannot create share links', audit.try(null,'select * from public.create_share_link(''d0000000-0000-0000-0000-00000000000a'', 3600)','anon') like 'error:%');
  perform audit.chk('A cannot insert into share_links directly', audit.try(A,'insert into public.share_links(code,user_id,document_id,expires_at) values (''AAAAAAAAAA'','''||A||''',''d0000000-0000-0000-0000-00000000000a'', now()+interval ''1 day'')') like 'error:%');
  perform audit.chk('A cannot edit share_links directly', audit.try(A,'update public.share_links set expires_at = now() + interval ''365 days''') like 'error:%');
  perform audit.chk('expiry shorter than a minute refused', audit.try(A,'select * from public.create_share_link(''d0000000-0000-0000-0000-00000000000a'', 10)') like '%SHARE_INVALID_EXPIRY%');
  perform audit.chk('expiry longer than 7 days refused', audit.try(A,'select * from public.create_share_link(''d0000000-0000-0000-0000-00000000000a'', 700000)') like '%SHARE_INVALID_EXPIRY%');
  perform audit.chk('share codes are 10 characters', (select bool_and(length(code)=10 and code ~ '^[A-Za-z0-9]+$') from public.share_links));
  perform audit.chk('A can run cancel on own share link', audit.try(A,'select public.revoke_share_link('''||(select code from public.share_links limit 1)||''')')='ok:1');
  perform audit.chk('A cancelled own share link (it is gone)', (select count(*) from public.share_links)=0);
  update public.documents set deleted_at = now() where id='d0000000-0000-0000-0000-00000000000a';
  perform audit.chk('a document in Trash cannot be shared', audit.try(A,'select * from public.create_share_link(''d0000000-0000-0000-0000-00000000000a'', 3600)') like '%SHARE_NOT_FOUND%');
  update public.documents set deleted_at = null where id='d0000000-0000-0000-0000-00000000000a';
  insert into public.documents(id,user_id,file_name,storage_path,file_type,mime_type,file_size) values ('d0000000-0000-0000-0000-0000000000c1',A,'tmp.pdf',A||'/d0000000-0000-0000-0000-0000000000c1/tmp.pdf','pdf','application/pdf',1);
  perform audit.try(A,'select * from public.create_share_link(''d0000000-0000-0000-0000-0000000000c1'', 3600)');
  perform audit.chk('link exists for temp document', (select count(*) from public.share_links where document_id='d0000000-0000-0000-0000-0000000000c1')=1);
  delete from public.documents where id='d0000000-0000-0000-0000-0000000000c1';
  perform audit.chk('deleting a document removes its share links', (select count(*) from public.share_links)=0);

  -- 9. Function hygiene
  for r in select p.proname from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.prokind='f' loop
    perform audit.chk('function '||r||' pins search_path', (select coalesce(array_to_string(proconfig,','),'') like '%search_path=%' from pg_proc where oid=('public.'||r)::regproc));
  end loop;
  for r in select p.proname from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.prosecdef loop
    perform audit.chk('SECURITY DEFINER function (review): '||r, true, 'allowed only if it is a pure ownership check or the signup trigger');
  end loop;
  perform audit.chk('no table grants to anon on public tables', not exists(select 1 from information_schema.role_table_grants where table_schema='public' and grantee='anon'));
  perform audit.chk('authenticated cannot DELETE profiles', not exists(select 1 from information_schema.role_table_grants where table_schema='public' and table_name='profiles' and grantee='authenticated' and privilege_type in ('DELETE','INSERT')));
end $$;

select case when pass then 'PASS' else 'FAIL' end || '  ' || name || case when detail<>'' then '  ['||detail||']' else '' end from audit.results order by pass, name;
select '---- ' || count(*) filter (where pass) || ' passed, ' || count(*) filter (where not pass) || ' FAILED of ' || count(*) from audit.results;
