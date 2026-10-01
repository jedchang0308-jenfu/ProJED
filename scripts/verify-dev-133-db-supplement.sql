\set ON_ERROR_STOP on
-- Only run in the new task-owned loopback DB, after the baseline matrix.
reset role;
insert into public.profiles(id,email,display_name) values
 ('00000000-0000-4000-8000-000000000133','dev133-a.invalid','fixture A'),
 ('00000000-0000-4000-8000-000000000134','dev133-b.invalid','fixture B');
insert into public.tenants(id,name,legacy_workspace_id,owner_id) values
 ('00000000-0000-4000-8000-000000000233','fixture A','dev133-ws-a','00000000-0000-4000-8000-000000000133'),
 ('00000000-0000-4000-8000-000000000234','fixture B','dev133-ws-b','00000000-0000-4000-8000-000000000134');
insert into public.tenant_members(tenant_id,user_id) values
 ('00000000-0000-4000-8000-000000000233','00000000-0000-4000-8000-000000000133');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000133',false);
do $$ declare r jsonb; begin
 r := public.create_quick_unplaced_task_v1('task_workbench_unplaced_00000000-0000-4000-8000-000000000133',chr(8203)||'保留'||chr(8203));
 if r->>'titleHash' <> encode(extensions.digest(convert_to(chr(8203)||'保留'||chr(8203),'UTF8'),'sha256'),'hex') then raise exception 'DEV133_ZERO_WIDTH_TRIM_REGRESSION'; end if;
 r := public.create_quick_unplaced_task_v1('task_workbench_unplaced_00000000-0000-4000-8000-000000000135',repeat(chr(128512),500));
 if r->>'created' <> 'true' then raise exception 'DEV133_CODE_POINT_REGRESSION'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000134',false);
do $$ begin
 begin
  perform public.create_quick_unplaced_task_v1('task_workbench_unplaced_00000000-0000-4000-8000-000000000134','retry same id','dev133-ws-a');
  raise exception 'DEV133_NO_MEMBERSHIP_MUST_FAIL';
 exception when others then if sqlerrm <> 'QT_NO_AVAILABLE_WORKSPACE' then raise; end if; end;
 if exists(select 1 from private.quick_task_capture_receipts where owner_id='00000000-0000-4000-8000-000000000133') then raise exception 'DEV133_FOREIGN_RECEIPT_VISIBLE'; end if;
 begin
  update private.quick_task_capture_receipts set committed_at=committed_at;
  raise exception 'DEV133_RECEIPT_UPDATE_ALLOWED';
 exception when insufficient_privilege then null; end;
 begin
  delete from private.quick_task_capture_receipts;
  raise exception 'DEV133_RECEIPT_DELETE_ALLOWED';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.tenant_members(tenant_id,user_id) values
 ('00000000-0000-4000-8000-000000000234','00000000-0000-4000-8000-000000000134');
set role authenticated;
do $$ declare r jsonb; begin
 r := public.create_quick_unplaced_task_v1('task_workbench_unplaced_00000000-0000-4000-8000-000000000134','retry same id','dev133-ws-a');
 if r->>'ownerId'<>'00000000-0000-4000-8000-000000000134' or not exists(select 1 from public.task_workbench_unplaced_items where id=r->>'captureId' and workspace_id='dev133-ws-b') then raise exception 'DEV133_FOREIGN_HINT_OR_RETRY'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000999',false);
do $$ begin
 begin
  perform public.create_quick_unplaced_task_v1('task_workbench_unplaced_00000000-0000-4000-8000-000000000999','missing profile');
  raise exception 'DEV133_MISSING_PROFILE_MUST_FAIL';
 exception when others then if sqlerrm <> 'QT_NO_AVAILABLE_WORKSPACE' then raise; end if; end;
end $$;
reset role;
select 'DEV133_SUPPLEMENT=PASS';
