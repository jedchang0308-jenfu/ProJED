-- Disposable target only, after the snapshot apply. Every mutation rolls back.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM projed_core.llm_access_logs
    WHERE id = '01234567-1234-4234-8234-123456789017'
      AND response_metadata = '"scalar metadata"'::jsonb
      AND jsonb_typeof(response_metadata) = 'string')
    OR NOT EXISTS (SELECT 1 FROM projed_core.llm_access_logs
      WHERE id = '01234567-1234-4234-8234-123456789018'
        AND response_metadata = 'null'::jsonb AND response_metadata IS NOT NULL) THEN
    RAISE EXCEPTION 'JSON scalar or JSON literal null was not retained exactly';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM projed_core.llm_access_logs
    WHERE id = '01234567-1234-4234-8234-123456789013'
      AND response_metadata = '9007199254740993.1234567890123456789'::jsonb
      AND created_at = '2026-01-04T00:00:00.123456Z'::timestamptz) THEN
    RAISE EXCEPTION 'JSON numeric precision or timestamp microseconds were lost';
  END IF;
END $$;
INSERT INTO projed_core.account_authorization_guards(local_user_id, active, revision)
VALUES ('11111111-1111-4111-8111-111111111111', true, 1),
       ('22222222-2222-4222-8222-222222222222', true, 1)
ON CONFLICT (local_user_id) DO NOTHING;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM projed_core.account_authorization_guards
     WHERE local_user_id IN ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
       AND (active IS DISTINCT FROM true OR revision <> 1)
  ) THEN
    RAISE EXCEPTION 'Existing account guard is not active at revision one';
  END IF;
END $$;

SET LOCAL ROLE projed_runtime_disposable;
DO $$ BEGIN
  IF (SELECT count(*) FROM projed_core.llm_access_logs) <> 0 THEN
    RAISE EXCEPTION 'LLM log read without actor context was allowed';
  END IF;
END $$;
SELECT set_config('projed.actor_principal_id', 'qa-snapshot-owner', true),
       set_config('projed.actor_local_user_id', '11111111-1111-4111-8111-111111111111', true),
       set_config('projed.actor_entry', 'main', true),
       set_config('projed.actor_context_id', '33333333-3333-4333-8333-333333333333', true),
       set_config('projed.actor_guard_revision', '1', true);

DO $$ BEGIN
  IF (SELECT count(*) FROM projed_core.llm_access_logs) <> 1 OR
     NOT EXISTS (SELECT 1 FROM projed_core.llm_access_logs
       WHERE id = '01234567-1234-4234-8234-123456789011'
         AND model = 'fixture-model' AND prompt_hash = 'original-prompt-hash'
         AND retrieved_chunk_ids = ARRAY['01234567-1234-4234-8234-123456789099']::uuid[]
         AND response_metadata = '{"resultCount":1,"usage":{"inputTokens":7}}'::jsonb
         AND created_at = '2026-01-02T00:00:00Z'::timestamptz) THEN
    RAISE EXCEPTION 'LLM log actor isolation or original evidence was not retained';
  END IF;
  INSERT INTO projed_core.llm_access_logs(id, tenant_id, actor_id, provider, response_metadata)
  VALUES ('01234567-1234-4234-8234-123456789015', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '11111111-1111-4111-8111-111111111111', 'qa-local-write', '["preserved"]');
  IF (SELECT count(*) FROM projed_core.llm_access_logs) <> 2 THEN
    RAISE EXCEPTION 'Own LLM log insert did not persist inside the transaction';
  END IF;
  BEGIN
    INSERT INTO projed_core.llm_access_logs(id, tenant_id, actor_id, provider)
    VALUES ('01234567-1234-4234-8234-123456789016', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '22222222-2222-4222-8222-222222222222', 'forged-actor');
    RAISE EXCEPTION 'Forged LLM log actor was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE projed_core.llm_access_logs SET provider = 'rewritten';
    RAISE EXCEPTION 'Runtime rewrote LLM evidence';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM projed_core.llm_access_logs;
    RAISE EXCEPTION 'Runtime deleted LLM evidence';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('projed.actor_local_user_id', '22222222-2222-4222-8222-222222222222', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM projed_core.llm_access_logs) <> 1 OR
     NOT EXISTS (SELECT 1 FROM projed_core.llm_access_logs
       WHERE id = '01234567-1234-4234-8234-123456789012'
         AND project_id IS NULL AND model IS NULL AND prompt_hash IS NULL
         AND response_metadata = '["legacy",{"tokens":2}]'::jsonb) THEN
    RAISE EXCEPTION 'LLM logs leaked another actor or lost nullable/array metadata';
  END IF;
END $$;

RESET ROLE;
UPDATE projed_core.tenant_members SET status = 'suspended'
WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  AND user_id = '22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE projed_runtime_disposable;
DO $$ BEGIN
  IF (SELECT count(*) FROM projed_core.llm_access_logs) <> 0 THEN
    RAISE EXCEPTION 'Suspended member still reads own LLM logs';
  END IF;
  BEGIN
    INSERT INTO projed_core.llm_access_logs(id, tenant_id, actor_id, provider)
    VALUES ('01234567-1234-4234-8234-123456789016', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '22222222-2222-4222-8222-222222222222', 'suspended-member');
    RAISE EXCEPTION 'Suspended member wrote an LLM log';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

RESET ROLE;
INSERT INTO projed_core.profiles(id, display_name)
VALUES ('44444444-4444-4444-8444-444444444444', 'QA deleted actor');
INSERT INTO projed_core.llm_access_logs(id, tenant_id, actor_id, provider)
VALUES ('01234567-1234-4234-8234-123456789014', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '44444444-4444-4444-8444-444444444444', 'qa-profile-delete');
DELETE FROM projed_core.profiles WHERE id = '44444444-4444-4444-8444-444444444444';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM projed_core.llm_access_logs
    WHERE id = '01234567-1234-4234-8234-123456789014' AND actor_id IS NULL) THEN
    RAISE EXCEPTION 'Profile delete did not retain anonymous LLM evidence';
  END IF;
END $$;

INSERT INTO projed_core.tenants(id, legacy_workspace_id, title, owner_id)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'qa-cross-scope', 'QA other scope',
        '11111111-1111-4111-8111-111111111111');
INSERT INTO projed_core.projects(id, tenant_id, legacy_board_id, title)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        'qa-other-board', 'QA other board');
SET LOCAL ROLE projed_runtime_disposable;
SELECT set_config('projed.actor_local_user_id', '11111111-1111-4111-8111-111111111111', true);
DO $$ BEGIN
  BEGIN
    INSERT INTO projed_core.llm_access_logs(id, tenant_id, actor_id, provider)
    VALUES ('01234567-1234-4234-8234-123456789016', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
            '11111111-1111-4111-8111-111111111111', 'cross-workspace');
    RAISE EXCEPTION 'Actor wrote LLM log without workspace membership';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO projed_core.llm_access_logs(id, tenant_id, project_id, actor_id, provider)
    VALUES ('01234567-1234-4234-8234-123456789016', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
            '11111111-1111-4111-8111-111111111111', 'mismatched-project');
    RAISE EXCEPTION 'Actor wrote LLM log against a mismatched board scope';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
RESET ROLE;
DELETE FROM projed_core.projects WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM projed_core.llm_access_logs
    WHERE id = '01234567-1234-4234-8234-123456789011') THEN
    RAISE EXCEPTION 'Project delete did not cascade its LLM logs';
  END IF;
END $$;
DELETE FROM projed_core.tenants WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM projed_core.llm_access_logs
    WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') THEN
    RAISE EXCEPTION 'Workspace delete did not cascade its LLM logs';
  END IF;
END $$;
ROLLBACK;
