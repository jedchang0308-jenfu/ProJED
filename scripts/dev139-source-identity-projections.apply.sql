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

DO $dev139_source_projection_postflight$
DECLARE
  projection_count integer;
  projection_column_count integer;
  expected_column_count integer;
  public_grant_count integer;
BEGIN
  SELECT count(*)
    INTO projection_count
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS relation_namespace
      ON relation_namespace.oid = relation.relnamespace
   WHERE relation_namespace.nspname = 'private'
     AND relation.relname = ANY(ARRAY[
       'projed_dev139_google_identities_v1',
       'projed_dev139_auth_users_v1'
     ])
     AND relation.relkind = 'v'
     AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
     AND COALESCE('security_barrier=true' = ANY(relation.reloptions), false)
     AND NOT COALESCE('security_invoker=true' = ANY(relation.reloptions), false);

  IF projection_count <> 2 THEN
    RAISE EXCEPTION 'DEV139_SOURCE_PROJECTION_POSTFLIGHT_INVALID';
  END IF;

  WITH expected(relation_name, column_name, data_type) AS (
    VALUES
      ('projed_dev139_google_identities_v1', 'user_id', 'uuid'),
      ('projed_dev139_google_identities_v1', 'provider', 'text'),
      ('projed_dev139_google_identities_v1', 'provider_id', 'text'),
      ('projed_dev139_google_identities_v1', 'identity_data', 'jsonb'),
      ('projed_dev139_auth_users_v1', 'id', 'uuid'),
      ('projed_dev139_auth_users_v1', 'banned_until', 'timestamp with time zone'),
      ('projed_dev139_auth_users_v1', 'deleted_at', 'timestamp with time zone')
  ), actual AS (
    SELECT relation.relname AS relation_name,
           attribute.attname AS column_name,
           pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS relation_namespace
        ON relation_namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
     WHERE relation_namespace.nspname = 'private'
       AND relation.relname = ANY(ARRAY[
         'projed_dev139_google_identities_v1',
         'projed_dev139_auth_users_v1'
       ])
  )
  SELECT (SELECT count(*) FROM actual),
         (SELECT count(*) FROM actual JOIN expected USING (relation_name, column_name, data_type))
    INTO projection_column_count, expected_column_count;

  IF projection_column_count <> 7 OR expected_column_count <> 7 THEN
    RAISE EXCEPTION 'DEV139_SOURCE_PROJECTION_COLUMNS_INVALID';
  END IF;

  IF NOT pg_catalog.has_schema_privilege(
       'projed_dev139_source_reader', 'private', 'USAGE'
     )
     OR NOT pg_catalog.has_table_privilege(
       'projed_dev139_source_reader',
       'private.projed_dev139_google_identities_v1',
       'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'projed_dev139_source_reader',
       'private.projed_dev139_auth_users_v1',
       'SELECT'
     )
     OR pg_catalog.has_table_privilege(
       'projed_dev139_source_reader', 'auth.identities', 'SELECT'
     )
     OR pg_catalog.has_table_privilege(
       'projed_dev139_source_reader', 'auth.users', 'SELECT'
     ) THEN
    RAISE EXCEPTION 'DEV139_SOURCE_PROJECTION_PRIVILEGES_INVALID';
  END IF;

  SELECT count(*)
    INTO public_grant_count
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS relation_namespace
      ON relation_namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
    ) AS relation_acl
   WHERE relation_namespace.nspname = 'private'
     AND relation.relname = ANY(ARRAY[
       'projed_dev139_google_identities_v1',
       'projed_dev139_auth_users_v1'
     ])
     AND relation_acl.grantee = 0;

  IF public_grant_count <> 0 THEN
    RAISE EXCEPTION 'DEV139_SOURCE_PROJECTION_PUBLIC_GRANT_INVALID';
  END IF;
END
$dev139_source_projection_postflight$;

COMMIT;
