-- Personal Vault: PIN lock audit. LOCAL / SCRATCH DATABASE ONLY (creates fake users, rewrites timestamps).
-- Prerequisite: migrations 0001..0006 applied. Last line must read "0 FAILED".
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned
drop schema if exists pa cascade; create schema pa;
create table pa.results(name text, pass boolean, detail text);
create function pa.chk(name text, pass boolean, detail text default '') returns void language sql as $$ insert into pa.results values (name, pass, detail) $$;
-- run a statement as a user (optionally with extra JWT claims); returns 'ok:<n>' or 'error:<msg>'
create function pa.try(uid uuid, stmt text, extra jsonb default '{}', r text default 'authenticated') returns text language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else (jsonb_build_object('sub', uid) || extra)::text end, true);
  execute 'set local role ' || r; execute stmt; get diagnostics n = row_count; execute 'reset role'; return 'ok:' || n;
exception when others then return 'error:' || sqlerrm; end $$;
-- run a select returning one text value as a user
create function pa.val(uid uuid, q text, extra jsonb default '{}', r text default 'authenticated') returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else (jsonb_build_object('sub', uid) || extra)::text end, true);
  execute 'set local role ' || r; execute q into v; execute 'reset role'; return v;
exception when others then return 'error:' || sqlerrm; end $$;

select set_config('storage.allow_delete_query','true',false);
delete from storage.objects where name like 'cccccccc-%' or name like 'dddddddd-%';
delete from auth.users where id in ('cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005');
insert into auth.users(id) values ('cccccccc-0000-0000-0000-000000000003'),('dddddddd-0000-0000-0000-000000000004');
insert into public.profiles(user_id,display_name) values ('cccccccc-0000-0000-0000-000000000003','C'),('dddddddd-0000-0000-0000-000000000004','D') on conflict do nothing;
insert into public.documents(id,user_id,file_name,storage_path,file_type,mime_type,file_size) values
 ('c0000000-0000-0000-0000-0000000000c1','cccccccc-0000-0000-0000-000000000003','one.pdf','cccccccc-0000-0000-0000-000000000003/c0000000-0000-0000-0000-0000000000c1/one.pdf','pdf','application/pdf',10),
 ('c0000000-0000-0000-0000-0000000000c2','cccccccc-0000-0000-0000-000000000003','two.pdf','cccccccc-0000-0000-0000-000000000003/c0000000-0000-0000-0000-0000000000c2/two.pdf','pdf','application/pdf',10);
insert into public.folders(id,user_id,name) values ('f1000000-0000-0000-0000-0000000000c1','cccccccc-0000-0000-0000-000000000003','empty-folder');
insert into storage.objects(bucket_id,name) values
 ('documents','cccccccc-0000-0000-0000-000000000003/c0000000-0000-0000-0000-0000000000c1/one.pdf'),
 ('documents','cccccccc-0000-0000-0000-000000000003/orphan/failed-upload.pdf');

do $$
declare
  C uuid := 'cccccccc-0000-0000-0000-000000000003'; D uuid := 'dddddddd-0000-0000-0000-000000000004';
  s text; i int; v text;
begin
  -- 0. Table is sealed
  perform pa.chk('user_pins has RLS enabled+forced', (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.user_pins'::regclass));
  perform pa.chk('authenticated cannot SELECT user_pins', pa.try(C,'select * from public.user_pins') like 'error:%permission denied%');
  perform pa.chk('authenticated cannot INSERT user_pins', pa.try(C,'insert into public.user_pins(user_id,pin_hash) values('''||C||''',''x'')') like 'error:%permission denied%');
  perform pa.chk('authenticated cannot UPDATE user_pins', pa.try(C,'update public.user_pins set failed_attempts=0') like 'error:%permission denied%');
  perform pa.chk('anon cannot call verify_pin', pa.try(null,'select * from public.verify_pin(''482916'')','{}'::jsonb,'anon') like 'error:%permission denied%');
  perform pa.chk('authenticated cannot call internal _pin_check', pa.try(C,'select * from public._pin_check('''||C||''',''482916'',true)') like 'error:%permission denied%');

  -- 1. No PIN yet: everything works as before
  perform pa.chk('no PIN: status says has_pin=false', pa.val(C,'select has_pin::text from public.pin_status()')='false');
  perform pa.chk('no PIN: trashing a document is allowed', pa.try(C,'update public.documents set deleted_at=now() where id=''c0000000-0000-0000-0000-0000000000c2''')='ok:1');
  perform pa.chk('no PIN: restore works', pa.try(C,'update public.documents set deleted_at=null where id=''c0000000-0000-0000-0000-0000000000c2''')='ok:1');
  perform pa.chk('no PIN: verify_pin returns ok', pa.val(C,'select ok::text from public.verify_pin(''000000'')')='true');

  -- 2. Setting a PIN
  perform pa.chk('weak PIN 111111 refused', pa.try(C,'select public.set_pin(''111111'')') like 'error:%PIN_INVALID%');
  perform pa.chk('weak PIN 123456 refused', pa.try(C,'select public.set_pin(''123456'')') like 'error:%PIN_INVALID%');
  perform pa.chk('5-digit PIN refused', pa.try(C,'select public.set_pin(''48291'')') like 'error:%PIN_INVALID%');
  perform pa.chk('letters refused', pa.try(C,'select public.set_pin(''48a916'')') like 'error:%PIN_INVALID%');
  perform pa.chk('good PIN accepted', pa.try(C,'select public.set_pin(''482916'')')='ok:1');
  perform pa.chk('PIN is stored hashed (bcrypt), never plain', (select pin_hash like '$2%' and pin_hash <> '482916' from public.user_pins where user_id=C));
  perform pa.chk('cannot overwrite an existing PIN with set_pin', pa.try(C,'select public.set_pin(''739restored'')') like 'error:%');
  perform pa.chk('cannot overwrite PIN with valid new value via set_pin', pa.try(C,'select public.set_pin(''739152'')') like 'error:%PIN_EXISTS%');
  perform pa.chk('other user D unaffected (no PIN)', pa.val(D,'select has_pin::text from public.pin_status()')='false');

  -- 3. Destructive actions are blocked unless the PIN was verified recently
  update public.user_pins set sensitive_until = now() - interval '1 minute' where user_id = C;
  perform pa.chk('status shows PIN not currently verified', pa.val(C,'select verified_seconds::text from public.pin_status()')='0');
  perform pa.chk('BLOCKED: move to Trash without recent PIN', pa.try(C,'update public.documents set deleted_at=now() where id=''c0000000-0000-0000-0000-0000000000c2''') like 'error:%PIN_REQUIRED%');
  perform pa.chk('BLOCKED: delete document row without recent PIN', pa.try(C,'delete from public.documents where id=''c0000000-0000-0000-0000-0000000000c2''') like 'error:%PIN_REQUIRED%');
  perform pa.chk('BLOCKED: delete folder without recent PIN', pa.try(C,'select public.delete_folder(''f1000000-0000-0000-0000-0000000000c1'')') like 'error:%PIN_REQUIRED%');
  perform pa.chk('BLOCKED: remove stored file without recent PIN', pa.try(C,'delete from storage.objects where name like ''%/one.pdf''')='ok:0');
  perform pa.chk('ALLOWED: orphan (failed upload) object cleanup', pa.try(C,'delete from storage.objects where name like ''%/failed-upload.pdf''')='ok:1');
  perform pa.chk('ALLOWED: ordinary edits (rename) still work', pa.try(C,'update public.documents set file_name=''renamed.pdf'' where id=''c0000000-0000-0000-0000-0000000000c2''')='ok:1');
  perform pa.chk('ALLOWED: favorite toggle still works', pa.try(C,'update public.documents set is_favorite=true where id=''c0000000-0000-0000-0000-0000000000c2''')='ok:1');
  perform pa.chk('BLOCKED: loosening auto-lock without recent PIN', pa.try(C,'select public.set_pin_lock_timeout(60)') like 'error:%PIN_REQUIRED%');

  -- 4. Wrong PIN, counting, lockout
  perform pa.chk('wrong PIN -> ok=false with 4 attempts left', pa.val(C,'select ok::text||'':''||attempts_left from public.verify_pin(''000001'')')='false:4');
  perform pa.chk('second wrong -> 3 left', pa.val(C,'select attempts_left::text from public.verify_pin(''000002'')')='3');
  perform pa.chk('failed attempts were actually saved (not rolled back)', (select failed_attempts from public.user_pins where user_id=C)=2);
  perform pa.chk('non-numeric attempt counts as wrong, never errors', pa.val(C,'select ok::text from public.verify_pin(''abcdef'')')='false');
  perform pa.chk('sql-injection style input is just a wrong PIN', pa.val(C,'select ok::text from public.verify_pin(''x'''' or 1=1 --'')')='false');
  perform pa.chk('4 failures recorded, 1 attempt left before lockout', (select failed_attempts from public.user_pins where user_id=C)=4);
  perform pa.chk('5th wrong locks for 15 min', pa.val(C,'select locked_seconds::text from public.verify_pin(''000005'')')='900');
  perform pa.chk('correct PIN is REFUSED while locked', pa.val(C,'select ok::text from public.verify_pin(''482916'')')='false');
  perform pa.chk('lock visible in status', pa.val(C,'select (locked_seconds > 800)::text from public.pin_status()')='true');
  perform pa.chk('still blocked from deleting while locked', pa.try(C,'update public.documents set deleted_at=now() where id=''c0000000-0000-0000-0000-0000000000c2''') like 'error:%PIN_REQUIRED%');
  update public.user_pins set locked_until = now() - interval '1 second' where user_id = C;
  perform pa.chk('after lock expires, correct PIN works', pa.val(C,'select ok::text from public.verify_pin(''482916'')')='true');
  perform pa.chk('success resets the failure counter', (select failed_attempts from public.user_pins where user_id=C)=0);

  -- 5. After a correct PIN the window opens
  perform pa.chk('status shows verified window ~300s', pa.val(C,'select (verified_seconds between 250 and 300)::text from public.pin_status()')='true');
  perform pa.chk('ALLOWED after PIN: move to Trash', pa.try(C,'update public.documents set deleted_at=now() where id=''c0000000-0000-0000-0000-0000000000c2''')='ok:1');
  perform pa.chk('ALLOWED after PIN: remove stored file', pa.try(C,'delete from storage.objects where name like ''%/one.pdf''')='ok:1');
  perform pa.chk('ALLOWED after PIN: delete document row', pa.try(C,'delete from public.documents where id=''c0000000-0000-0000-0000-0000000000c2''')='ok:1');
  perform pa.chk('ALLOWED after PIN: delete folder', pa.try(C,'select public.delete_folder(''f1000000-0000-0000-0000-0000000000c1'')')='ok:1');
  perform pa.chk('ALLOWED after PIN: set auto-lock 15', pa.try(C,'select public.set_pin_lock_timeout(15)')='ok:1');
  perform pa.chk('invalid auto-lock value refused', pa.try(C,'select public.set_pin_lock_timeout(7)') like 'error:%PIN_INVALID%');
  update public.user_pins set sensitive_until = now() - interval '1 second' where user_id = C;
  perform pa.chk('window really expires', pa.val(C,'select public.pin_recent()::text')='false');

  -- 6. Changing and removing need the current PIN
  perform pa.chk('change_pin with wrong current fails (ok=false)', pa.val(C,'select ok::text from public.change_pin(''999999'',''739152'')')='false');
  perform pa.chk('change_pin to weak new PIN refused', pa.try(C,'select * from public.change_pin(''482916'',''000000'')') like 'error:%PIN_INVALID%');
  perform pa.chk('change_pin with right current succeeds', pa.val(C,'select ok::text from public.change_pin(''482916'',''739152'')')='true');
  perform pa.chk('old PIN no longer works', pa.val(C,'select ok::text from public.verify_pin(''482916'')')='false');
  perform pa.chk('new PIN works', pa.val(C,'select ok::text from public.verify_pin(''739152'')')='true');
  v := pa.val(C,'select ok::text from public.remove_pin(''000009'')');
  perform pa.chk('remove_pin with wrong PIN does not remove', v='false' and exists(select 1 from public.user_pins where user_id=C));
  v := pa.val(C,'select ok::text from public.remove_pin(''739152'')');
  perform pa.chk('remove_pin with right PIN removes', v='true' and not exists(select 1 from public.user_pins where user_id=C));

  -- 7. Forgot-PIN reset needs a password login in the last 2 minutes
  perform pa.try(C,'select public.set_pin(''482916'')');
  perform pa.chk('reset refused with no amr claim', pa.try(C,'select public.reset_pin_after_login()') like 'error:%RECENT_LOGIN_REQUIRED%');
  perform pa.chk('reset refused with OLD password login (10 min ago)', pa.try(C,'select public.reset_pin_after_login()', jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method','password','timestamp', extract(epoch from now())::bigint - 600)))) like 'error:%RECENT_LOGIN_REQUIRED%');
  perform pa.chk('reset refused with a non-password method', pa.try(C,'select public.reset_pin_after_login()', jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method','otp','timestamp', extract(epoch from now())::bigint)))) like 'error:%RECENT_LOGIN_REQUIRED%');
  perform pa.chk('PIN still there after refusals', exists(select 1 from public.user_pins where user_id=C));
  v := pa.try(C,'select public.reset_pin_after_login()', jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method','password','timestamp', extract(epoch from now())::bigint - 20))));
  perform pa.chk('reset works right after a password login', v='ok:1' and not exists(select 1 from public.user_pins where user_id=C));

  -- 8. Isolation between users
  perform pa.try(D,'select public.set_pin(''571038'')');
  perform pa.chk('D has own PIN, C unaffected', pa.val(D,'select has_pin::text from public.pin_status()')='true' and pa.val(C,'select has_pin::text from public.pin_status()')='false');
  perform pa.chk('C cannot verify against D''s PIN (C has none: ok=true is for C only, D stays locked down)', pa.val(D,'select ok::text from public.verify_pin(''482916'')')='false');
  perform pa.chk('D failed attempts do not touch C', (select count(*) from public.user_pins where user_id=C)=0);
  perform pa.chk('pin_recent for D is true right after setting', pa.val(D,'select public.pin_recent()::text')='true');
end $$;

-- cascade test as superuser (no auth.uid): account deletion must work even with a PIN set
set role postgres;
insert into auth.users(id) values ('eeeeeeee-0000-0000-0000-000000000005') on conflict do nothing;
insert into public.profiles(user_id) values ('eeeeeeee-0000-0000-0000-000000000005') on conflict do nothing;
insert into public.documents(user_id,file_name,storage_path,file_type,mime_type,file_size) values ('eeeeeeee-0000-0000-0000-000000000005','z.pdf','eeeeeeee-0000-0000-0000-000000000005/z/z.pdf','pdf','application/pdf',1);
insert into public.user_pins(user_id,pin_hash,sensitive_until) values ('eeeeeeee-0000-0000-0000-000000000005','x', now() - interval '1 hour');
delete from auth.users where id='eeeeeeee-0000-0000-0000-000000000005';
insert into pa.results select 'account deletion (admin/cascade) works even with a PIN and expired window', not exists(select 1 from public.documents where user_id='eeeeeeee-0000-0000-0000-000000000005') and not exists(select 1 from public.user_pins where user_id='eeeeeeee-0000-0000-0000-000000000005'), '';

select case when pass then 'PASS' else 'FAIL' end || '  ' || name from pa.results order by pass, name;
select '---- ' || count(*) filter (where pass) || ' passed, ' || count(*) filter (where not pass) || ' FAILED of ' || count(*) from pa.results;
