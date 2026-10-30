-- A cleared transaction-local custom setting can remain as an empty string on
-- a pooled connection. Validate before planning any query that casts it.
CREATE OR REPLACE FUNCTION projed_core.actor_context_valid_v1()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  principal text := current_setting('projed.actor_principal_id', true);
  entry text := current_setting('projed.actor_entry', true);
  context_id text := current_setting('projed.actor_context_id', true);
  revision_text text := current_setting('projed.actor_guard_revision', true);
  revision_value bigint;
BEGIN
  IF NOT COALESCE(
    length(principal) BETWEEN 1 AND 255
    AND entry IN ('main', 'quick')
    AND context_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    AND revision_text ~ '^[1-9][0-9]{0,18}$', false
  ) THEN
    RETURN false;
  END IF;
  IF revision_text::numeric > 9223372036854775807 THEN
    RETURN false;
  END IF;
  revision_value := revision_text::bigint;
  RETURN EXISTS (
    SELECT 1 FROM projed_core.account_authorization_guards AS guard
     WHERE guard.local_user_id = projed_core.current_actor_user_id_v1()
       AND guard.active AND guard.revision = revision_value
  );
END;
$$;
