-- Source-only credential preparation. No business writes or credential material.
BEGIN;

DO $source_reader_execute_preflight$
BEGIN
  IF current_user <> 'postgres'
     OR pg_catalog.to_regprocedure('public.create_tenant_with_owner(text)') IS NULL
     OR NOT pg_catalog.has_function_privilege('anon', 'public.create_tenant_with_owner(text)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.create_tenant_with_owner(text)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.create_tenant_with_owner(text)', 'EXECUTE')
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname = 'projed_dev139_source_reader'
         AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
     ) THEN
    RAISE EXCEPTION 'DEV139_SOURCE_EXECUTE_PREFLIGHT_FAILED';
  END IF;
END
$source_reader_execute_preflight$;

-- Existing API roles already have explicit grants; leave those grants untouched.
-- A direct migration reader must not inherit this business writer through PUBLIC.
REVOKE EXECUTE ON FUNCTION public.create_tenant_with_owner(text) FROM PUBLIC;

DO $source_reader_execute_postflight$
BEGIN
  IF pg_catalog.has_function_privilege('projed_dev139_source_reader', 'public.create_tenant_with_owner(text)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('anon', 'public.create_tenant_with_owner(text)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.create_tenant_with_owner(text)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.create_tenant_with_owner(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'DEV139_SOURCE_EXECUTE_POSTFLIGHT_FAILED';
  END IF;
END
$source_reader_execute_postflight$;

COMMIT;
