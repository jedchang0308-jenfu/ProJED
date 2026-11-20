BEGIN;

DO $dev139_source_projection_preflight$
DECLARE
  source_reader record;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'DEV139_SOURCE_PROJECTION_OWNER_INVALID';
  END IF;

  SELECT role.rolsuper,
         role.rolcanlogin,
         role.rolinherit,
         role.rolcreatedb,
         role.rolcreaterole,
         role.rolreplication,
         role.rolbypassrls
    INTO source_reader
    FROM pg_catalog.pg_roles
    AS role
   WHERE role.rolname = 'projed_dev139_source_reader';

  IF NOT FOUND
     OR source_reader.rolsuper
     OR source_reader.rolcanlogin
     OR source_reader.rolinherit
     OR source_reader.rolcreatedb
     OR source_reader.rolcreaterole
     OR source_reader.rolreplication
     OR NOT source_reader.rolbypassrls
     OR NOT pg_catalog.has_schema_privilege(
       'projed_dev139_source_reader', 'private', 'USAGE'
     ) THEN
    RAISE EXCEPTION 'DEV139_SOURCE_READER_INVALID';
  END IF;

  IF pg_catalog.to_regclass('private.projed_dev139_google_identities_v1') IS NOT NULL
     OR pg_catalog.to_regclass('private.projed_dev139_auth_users_v1') IS NOT NULL THEN
    RAISE EXCEPTION 'DEV139_SOURCE_PROJECTION_ALREADY_EXISTS';
  END IF;
END
$dev139_source_projection_preflight$;

CREATE VIEW private.projed_dev139_google_identities_v1
WITH (security_barrier = true) AS
SELECT identity.user_id,
       identity.provider,
       identity.provider_id,
       identity.identity_data
  FROM auth.identities AS identity
 WHERE identity.provider = 'google';

CREATE VIEW private.projed_dev139_auth_users_v1
WITH (security_barrier = true) AS
SELECT source_user.id,
       source_user.banned_until,
       source_user.deleted_at
  FROM auth.users AS source_user
 WHERE EXISTS (
   SELECT 1
     FROM auth.identities AS identity
    WHERE identity.user_id = source_user.id
      AND identity.provider = 'google'
 );

ALTER VIEW private.projed_dev139_google_identities_v1 OWNER TO postgres;
ALTER VIEW private.projed_dev139_auth_users_v1 OWNER TO postgres;

REVOKE ALL ON TABLE private.projed_dev139_google_identities_v1 FROM PUBLIC;
REVOKE ALL ON TABLE private.projed_dev139_auth_users_v1 FROM PUBLIC;
REVOKE ALL ON TABLE auth.identities FROM projed_dev139_source_reader;
REVOKE ALL ON TABLE auth.users FROM projed_dev139_source_reader;

GRANT SELECT ON TABLE private.projed_dev139_google_identities_v1
  TO projed_dev139_source_reader;
GRANT SELECT ON TABLE private.projed_dev139_auth_users_v1
  TO projed_dev139_source_reader;

COMMIT;
