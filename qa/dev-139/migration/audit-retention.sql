-- Disposable target only, after full apply/reconcile. All writes roll back.
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM projed_core.audit_logs) <> 3
    OR NOT EXISTS (SELECT 1 FROM projed_core.audit_logs
      WHERE id = '56789012-1234-4234-8234-123456789006'
        AND tenant_id IS NULL AND project_id IS NULL
        AND actor_id = '11111111-1111-4111-8111-111111111111'
        AND action = 'legacy.profile.update' AND entity_table = 'profiles'
        AND entity_id = '11111111-1111-4111-8111-111111111111' AND entity_ref IS NULL
        AND before_data = '{"value":9007199254740993.1234567890123456789,"nested":{"value":null}}'::jsonb
        AND after_data = '{"label":"preserved without workspace"}'::jsonb
        AND created_at = '2026-01-03T00:00:00.123456Z'::timestamptz)
    OR NOT EXISTS (SELECT 1 FROM projed_core.audit_logs
      WHERE id = '56789012-1234-4234-8234-123456789007'
        AND tenant_id IS NULL AND project_id IS NULL AND actor_id IS NULL
        AND action = 'legacy.system.event' AND entity_table = 'profiles'
        AND entity_id IS NULL AND before_data IS NULL AND after_data IS NULL
        AND created_at = '2026-01-04T00:00:00.654321Z'::timestamptz) THEN
    RAISE EXCEPTION 'Legacy audit evidence lost data or acquired an invented scope/actor';
  END IF;
END $$;
SET LOCAL ROLE projed_importer_disposable;
DO $$ BEGIN
  IF (SELECT count(*) FROM projed_core.audit_logs) <> 3 THEN
    RAISE EXCEPTION 'Importer could not reconcile all original audit evidence';
  END IF;
  BEGIN
    INSERT INTO projed_core.audit_logs(id, project_id, action, entity_table)
    VALUES ('56789012-1234-4234-8234-123456789008', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'invalid.scope', 'profiles');
    RAISE EXCEPTION 'Board audit without a workspace was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO projed_core.account_authorization_guards(local_user_id, active, revision)
VALUES ('11111111-1111-4111-8111-111111111111', true, 1),
       ('22222222-2222-4222-8222-222222222222', true, 1)
ON CONFLICT (local_user_id) DO NOTHING;
SET LOCAL ROLE projed_runtime_disposable;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM projed_core.audit_logs) THEN
    RAISE EXCEPTION 'Audit evidence was visible without a verified actor';
  END IF;
END $$;
SELECT set_config('projed.actor_principal_id', 'qa-snapshot-owner', true),
       set_config('projed.actor_local_user_id', '11111111-1111-4111-8111-111111111111', true),
       set_config('projed.actor_entry', 'main', true),
       set_config('projed.actor_context_id', '33333333-3333-4333-8333-333333333333', true),
       set_config('projed.actor_guard_revision', '1', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM projed_core.audit_logs) <> 1
    OR NOT EXISTS (SELECT 1 FROM projed_core.audit_logs WHERE id = '56789012-1234-4234-8234-123456789005') THEN
    RAISE EXCEPTION 'Workspace audit access changed or unscoped evidence leaked to its actor/admin';
  END IF;
  BEGIN
    INSERT INTO projed_core.audit_logs(id, actor_id, action, entity_table)
    VALUES ('56789012-1234-4234-8234-123456789009', '11111111-1111-4111-8111-111111111111', 'forged.global', 'profiles');
    RAISE EXCEPTION 'Runtime created an unscoped audit event';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO projed_core.audit_logs(id, tenant_id, actor_id, action, entity_table)
  VALUES ('56789012-1234-4234-8234-123456789010', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111', 'scoped.write', 'profiles');
  IF (SELECT count(*) FROM projed_core.audit_logs) <> 2 THEN
    RAISE EXCEPTION 'Authorized workspace audit write regressed';
  END IF;
  BEGIN
    UPDATE projed_core.audit_logs SET action = 'rewritten';
    RAISE EXCEPTION 'Runtime rewrote audit evidence';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM projed_core.audit_logs;
    RAISE EXCEPTION 'Runtime deleted audit evidence';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('projed.actor_local_user_id', '22222222-2222-4222-8222-222222222222', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM projed_core.audit_logs WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION 'Unscoped legacy audit evidence leaked to another actor';
  END IF;
END $$;
ROLLBACK;
