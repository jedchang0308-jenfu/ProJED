import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Client } from 'pg';

// Release operator runs the printed SQL on the legacy database during cutover.
// This module never connects to Supabase or changes its state by itself.
const triggerName = 'projed_dev139_pause_business_writes';
const triggerFunction = 'private.projed_dev139_reject_business_write';
const body = "BEGIN RAISE EXCEPTION USING ERRCODE = 'PT503', MESSAGE = 'PROJED_SOURCE_WRITE_PAUSED'; END;";
const tables = `
  SELECT c.oid, n.nspname, c.relname, c.relkind
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('public', 'private') AND c.relkind IN ('r', 'p', 'f')
     AND NOT EXISTS (SELECT FROM pg_catalog.pg_depend d WHERE d.classid = 'pg_catalog.pg_class'::regclass
       AND d.objid = c.oid AND d.deptype = 'e')`;

const functionId = `to_regprocedure('${triggerFunction}()')`;
const exactFunction = `EXISTS (SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
  WHERE p.oid = ${functionId} AND p.proowner = 'postgres'::regrole AND p.prorettype = 'trigger'::regtype
    AND l.lanname = 'plpgsql' AND NOT p.prosecdef AND p.prosrc = $body$${body}$body$)`;
const sourceMatches = `to_regclass('private.projed_dev139_google_identities_v1') IS NOT NULL
  AND to_regclass('private.projed_dev139_auth_users_v1') IS NOT NULL
  AND to_regclass('public.profiles') IS NOT NULL AND to_regclass('public.tenants') IS NOT NULL
  AND to_regrole('projed_dev139_source_reader') IS NOT NULL AND to_regnamespace('projed_core') IS NULL`;
const fenced = `WITH app_tables AS (${tables})
  SELECT (${sourceMatches}) AND ${exactFunction}
  AND NOT EXISTS (SELECT FROM pg_catalog.pg_inherits i
    LEFT JOIN app_tables parent ON parent.oid = i.inhparent
    LEFT JOIN app_tables child ON child.oid = i.inhrelid
    WHERE (parent.oid IS NULL) <> (child.oid IS NULL))
  AND NOT EXISTS (
  SELECT FROM app_tables t WHERE t.relkind = 'f' OR NOT EXISTS (
    SELECT FROM pg_catalog.pg_trigger g WHERE g.tgrelid = t.oid AND g.tgname = '${triggerName}'
      AND g.tgfoid = ${functionId} AND g.tgenabled = 'A' AND NOT g.tgisinternal
      AND g.tgtype = 62 AND g.tgnargs = 0 AND g.tgqual IS NULL AND g.tgattr = ''::int2vector
  )) AS fenced`;

export async function assertSourceAppWritesPaused(source: Client): Promise<void> {
  const result = await source.query<{ fenced: boolean }>(fenced);
  if (result.rows[0]?.fenced !== true) {
    throw Object.assign(new Error('Legacy business tables are writable or their fence is incomplete'), {
      code: 'SOURCE_APP_WRITES_NOT_PAUSED',
    });
  }
}

export function renderSourceAppWriteFence(mode: 'apply' | 'remove'): string {
  const preflight = `BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $check$ BEGIN
  IF current_user <> 'postgres' OR NOT (${sourceMatches}) THEN RAISE EXCEPTION 'SOURCE_FENCE_TARGET_INVALID'; END IF;
END $check$;`;
  if (mode === 'apply') return `${preflight}
CREATE FUNCTION ${triggerFunction}() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $body$${body}$body$;
REVOKE ALL ON FUNCTION ${triggerFunction}() FROM PUBLIC;
DO $apply$ DECLARE t record; BEGIN
  FOR t IN ${tables} ORDER BY c.oid LOOP
    IF t.relkind = 'f' THEN RAISE EXCEPTION 'SOURCE_FOREIGN_WRITER_UNSUPPORTED'; END IF;
    EXECUTE format('LOCK TABLE ONLY %I.%I IN ACCESS EXCLUSIVE MODE', t.nspname, t.relname);
    EXECUTE format('CREATE TRIGGER ${triggerName} BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I.%I
      FOR EACH STATEMENT EXECUTE FUNCTION ${triggerFunction}()', t.nspname, t.relname);
    EXECUTE format('ALTER TABLE ONLY %I.%I ENABLE ALWAYS TRIGGER ${triggerName}', t.nspname, t.relname);
  END LOOP;
  IF NOT (${fenced}) THEN RAISE EXCEPTION 'SOURCE_APP_WRITES_NOT_PAUSED'; END IF;
END $apply$;
COMMIT;`;
  // Release only triggers attached to our exact function. RESTRICT preserves any
  // unexpected dependents and rolls back the entire release if one exists.
  return `${preflight}
DO $remove$ DECLARE t record; BEGIN
  IF NOT ${exactFunction} THEN RAISE EXCEPTION 'SOURCE_FENCE_OWNER_INVALID'; END IF;
  FOR t IN SELECT c.oid, n.nspname, c.relname FROM pg_catalog.pg_trigger g
    JOIN pg_catalog.pg_class c ON c.oid = g.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE g.tgfoid = ${functionId} AND g.tgname = '${triggerName}'
      AND NOT g.tgisinternal AND n.nspname IN ('public', 'private') ORDER BY c.oid LOOP
    EXECUTE format('DROP TRIGGER ${triggerName} ON %I.%I RESTRICT', t.nspname, t.relname);
  END LOOP;
END $remove$;
DROP FUNCTION ${triggerFunction}() RESTRICT;
COMMIT;`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || (mode !== 'apply' && mode !== 'remove')) {
    throw new Error('Specify apply or remove to print the SQL for the legacy source');
  }
  process.stdout.write(renderSourceAppWriteFence(mode) + '\n');
}
