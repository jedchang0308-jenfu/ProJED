-- Disposable target only. Do not assign an owner or membership to old orphans.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM projed_core.tenants
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9'
      AND legacy_workspace_id = 'orphan-ws' AND owner_id IS NULL)
    OR NOT EXISTS (SELECT 1 FROM projed_core.projects
      WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc9'
        AND tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9')
    OR NOT EXISTS (SELECT 1 FROM projed_core.wbs_items
      WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9'
        AND tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9'
        AND project_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc9'
        AND description = 'Unowned data must not be discarded') THEN
    RAISE EXCEPTION 'Unowned workspace/board/task original identity or data was lost';
  END IF;
  IF EXISTS (SELECT 1 FROM projed_core.tenant_members WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9')
    OR EXISTS (SELECT 1 FROM projed_core.project_members WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9')
    OR EXISTS (SELECT 1 FROM projed_core.actor_scope_access WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9') THEN
    RAISE EXCEPTION 'Migration invented access to an unowned workspace';
  END IF;
END $$;
INSERT INTO projed_core.account_authorization_guards(local_user_id, active, revision)
VALUES ('11111111-1111-4111-8111-111111111111', true, 1);
SET LOCAL ROLE projed_runtime_disposable;
SELECT set_config('projed.actor_principal_id', 'qa-owner-only', true),
       set_config('projed.actor_local_user_id', '11111111-1111-4111-8111-111111111111', true),
       set_config('projed.actor_entry', 'main', true),
       set_config('projed.actor_context_id', '33333333-3333-4333-8333-333333333333', true),
       set_config('projed.actor_guard_revision', '1', true);
DO $$ DECLARE changed integer; BEGIN
  IF NOT EXISTS (SELECT 1 FROM projed_core.tenants WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') THEN
    RAISE EXCEPTION 'Positive authorized workspace control was not readable';
  END IF;
  IF EXISTS (SELECT 1 FROM projed_core.tenants WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9')
    OR EXISTS (SELECT 1 FROM projed_core.projects WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc9')
    OR EXISTS (SELECT 1 FROM projed_core.wbs_items WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9')
    OR EXISTS (SELECT 1 FROM projed_core.resource_revisions WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9') THEN
    RAISE EXCEPTION 'Actor gained access to old unowned workspace data';
  END IF;
  UPDATE projed_core.actor_scope_access SET scope_revision = scope_revision + 1
  WHERE local_user_id = '11111111-1111-4111-8111-111111111111'
    AND tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    AND project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'Scope update succeeded without an authorized transfer'; END IF;
  BEGIN
    UPDATE projed_core.tenants SET owner_id = '11111111-1111-4111-8111-111111111111'
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';
    RAISE EXCEPTION 'Runtime claimed an unowned workspace';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO projed_core.tenants(id, legacy_workspace_id, title, owner_id)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7', 'invalid-ownerless-new', 'Invalid', NULL);
    RAISE EXCEPTION 'Runtime created an ownerless workspace';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO projed_core.profiles(id, display_name)
VALUES ('44444444-4444-4444-8444-444444444444', 'QA deleted owner');
INSERT INTO projed_core.tenants(id, legacy_workspace_id, title, owner_id)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8', 'qa-owner-delete', 'QA owner lifecycle',
        '44444444-4444-4444-8444-444444444444');
DELETE FROM projed_core.profiles WHERE id = '44444444-4444-4444-8444-444444444444';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM projed_core.tenants
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8' AND owner_id IS NULL) THEN
    RAISE EXCEPTION 'Deleted owner changed or destroyed original workspace identity';
  END IF;
END $$;
ROLLBACK;
