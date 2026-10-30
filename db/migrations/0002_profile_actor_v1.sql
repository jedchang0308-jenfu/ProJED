CREATE TABLE projed_core.profiles (
  id uuid PRIMARY KEY,
  email text,
  display_name text,
  external_auth_provider text,
  external_auth_id text,
  ui_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_external_auth_pair_unique UNIQUE (external_auth_provider, external_auth_id),
  CONSTRAINT profiles_external_auth_pair_complete CHECK (
    (external_auth_provider IS NULL) = (external_auth_id IS NULL)
  )
);

CREATE TABLE projed_core.account_authorization_guards (
  local_user_id uuid PRIMARY KEY REFERENCES projed_core.profiles(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9223372036854775807),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION projed_core.current_actor_user_id_v1()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN current_setting('projed.actor_local_user_id', true)
      ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    THEN current_setting('projed.actor_local_user_id', true)::uuid
    ELSE NULL::uuid
  END
$$;

CREATE FUNCTION projed_core.actor_context_valid_v1()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN length(current_setting('projed.actor_principal_id', true)) BETWEEN 1 AND 255
      AND current_setting('projed.actor_entry', true) IN ('main', 'quick')
      AND current_setting('projed.actor_context_id', true)
        ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      AND current_setting('projed.actor_guard_revision', true) ~ '^[1-9][0-9]{0,18}$'
      AND current_setting('projed.actor_guard_revision', true)::numeric <= 9223372036854775807
    THEN EXISTS (
      SELECT 1
        FROM projed_core.account_authorization_guards AS guard
       WHERE guard.local_user_id = projed_core.current_actor_user_id_v1()
         AND guard.active
         AND guard.revision = current_setting('projed.actor_guard_revision', true)::bigint
    )
    ELSE false
  END
$$;

ALTER TABLE projed_core.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.account_authorization_guards ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.account_authorization_guards FORCE ROW LEVEL SECURITY;

CREATE POLICY account_guard_actor_select_v1
  ON projed_core.account_authorization_guards
  FOR SELECT TO projed_runtime_disposable
  USING (local_user_id = projed_core.current_actor_user_id_v1());

CREATE POLICY profile_actor_select_v1
  ON projed_core.profiles
  FOR SELECT TO projed_runtime_disposable
  USING (id = projed_core.current_actor_user_id_v1() AND projed_core.actor_context_valid_v1());

CREATE POLICY profile_actor_update_v1
  ON projed_core.profiles
  FOR UPDATE TO projed_runtime_disposable
  USING (id = projed_core.current_actor_user_id_v1() AND projed_core.actor_context_valid_v1())
  WITH CHECK (id = projed_core.current_actor_user_id_v1() AND projed_core.actor_context_valid_v1());

REVOKE ALL ON ALL TABLES IN SCHEMA projed_core FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA projed_core FROM PUBLIC;
GRANT USAGE ON SCHEMA projed_core TO projed_runtime_disposable;
GRANT SELECT ON projed_core.account_authorization_guards TO projed_runtime_disposable;
GRANT SELECT ON projed_core.profiles TO projed_runtime_disposable;
GRANT UPDATE (display_name, ui_preferences, updated_at) ON projed_core.profiles TO projed_runtime_disposable;
GRANT EXECUTE ON FUNCTION projed_core.current_actor_user_id_v1() TO projed_runtime_disposable;
GRANT EXECUTE ON FUNCTION projed_core.actor_context_valid_v1() TO projed_runtime_disposable;
