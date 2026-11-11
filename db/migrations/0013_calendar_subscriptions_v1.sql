CREATE TABLE projed_core.calendar_subscriptions (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES projed_core.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  filters_json jsonb NOT NULL CHECK (jsonb_typeof(filters_json) = 'object'),
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NULL,
  last_accessed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX calendar_subscriptions_owner_created_idx
  ON projed_core.calendar_subscriptions(owner_user_id, created_at DESC);

ALTER TABLE projed_core.calendar_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.calendar_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY calendar_subscriptions_owner_select_v1
  ON projed_core.calendar_subscriptions
  FOR SELECT TO projed_runtime_disposable
  USING (
    owner_user_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );

-- The public feed resolves only the row whose bearer token hash was set by the
-- server for the current transaction. The raw token is never stored in SQL.
CREATE POLICY calendar_subscriptions_feed_token_select_v1
  ON projed_core.calendar_subscriptions
  FOR SELECT TO projed_runtime_disposable
  USING (
    current_setting('projed.calendar_feed_token_hash', true) ~ '^[a-f0-9]{64}$'
    AND token_hash = current_setting('projed.calendar_feed_token_hash', true)
  );

CREATE POLICY calendar_subscriptions_owner_insert_v1
  ON projed_core.calendar_subscriptions
  FOR INSERT TO projed_runtime_disposable
  WITH CHECK (
    owner_user_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );

CREATE POLICY calendar_subscriptions_owner_update_v1
  ON projed_core.calendar_subscriptions
  FOR UPDATE TO projed_runtime_disposable
  USING (
    owner_user_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  )
  WITH CHECK (
    owner_user_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );

CREATE POLICY calendar_subscriptions_owner_delete_v1
  ON projed_core.calendar_subscriptions
  FOR DELETE TO projed_runtime_disposable
  USING (
    owner_user_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );

-- After a successful token-hash lookup, the kernel binds that row's owner to
-- the same transaction. This avoids a policy recursion between subscription
-- owner checks and account-guard checks while exposing only that one guard.
CREATE POLICY account_guard_calendar_feed_select_v1
  ON projed_core.account_authorization_guards
  FOR SELECT TO projed_runtime_disposable
  USING (
    current_setting('projed.calendar_feed_token_hash', true) ~ '^[a-f0-9]{64}$'
    AND current_setting('projed.calendar_feed_owner_user_id', true)
      ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    AND local_user_id::text = current_setting('projed.calendar_feed_owner_user_id', true)
  );

REVOKE ALL ON projed_core.calendar_subscriptions FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON projed_core.calendar_subscriptions TO projed_runtime_disposable;
GRANT UPDATE (name, token_hash, filters_json, is_active, expires_at, last_accessed_at, updated_at)
  ON projed_core.calendar_subscriptions TO projed_runtime_disposable;
