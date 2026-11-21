import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

import type { RuntimeConfig } from './config.js';
import { KernelError } from './errors.js';
import { managedRuntimeJobConnectionOptions, prepareManagedDatabaseSession } from '../shared/dev139ManagedDatabase.mjs';

export interface RuntimeDatabaseOptions {
  /** Test seam for the managed Job's per-connection metadata token callback. */
  readonly managedJobTokenProvider?: () => Promise<string>;
}

export interface DatabaseLease {
  readonly client: PoolClient;
  release(destroy?: boolean): void;
}

export interface ExpectedMigration {
  version: string;
  checksum: string;
}

export type ScopedQuery = <R extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: readonly unknown[],
) => Promise<QueryResult<R>>;

export class RuntimeDatabase {
  readonly #pool: Pool;
  readonly #config: RuntimeConfig;
  #closed = false;

  constructor(config: RuntimeConfig, options: RuntimeDatabaseOptions = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)
        || Object.keys(options).some(key => key !== 'managedJobTokenProvider')
        || (Object.hasOwn(options, 'managedJobTokenProvider')
          && typeof options.managedJobTokenProvider !== 'function')) {
      throw new KernelError('CONFIG_INVALID', 'Runtime database options are invalid');
    }
    if (options.managedJobTokenProvider !== undefined && config.managedJobTransport !== true) {
      throw new KernelError('CONFIG_INVALID', 'Managed Job token provider requires the managed Job transport');
    }
    if (config.managedJobTransport === true && (config.env !== 'managed' || config.entry !== 'main')) {
      throw new KernelError('CONFIG_INVALID', 'Managed Job transport requires the managed main entry');
    }
    this.#config = config;
    const connectionOptions = config.managedJobTransport === true
      ? managedRuntimeJobConnectionOptions(config.databaseUrl, config.binding, options.managedJobTokenProvider)
      : { connectionString: config.databaseUrl };
    this.#pool = new Pool({
      ...connectionOptions,
      max: config.profile.runtime.pool.max,
      min: config.profile.runtime.pool.min,
      idleTimeoutMillis: config.profile.runtime.pool.idleTimeoutMillis,
      connectionTimeoutMillis: config.profile.runtime.pool.connectionTimeoutMillis,
      statement_timeout: config.profile.runtime.timeouts.statementMillis,
      lock_timeout: config.profile.runtime.timeouts.lockMillis,
      idle_in_transaction_session_timeout: config.profile.runtime.timeouts.idleInTransactionMillis,
      application_name: `projed-dev139-s1-${config.entry}`,
    });
    this.#pool.on('error', (error) => {
      console.error(JSON.stringify({ event: 'db_idle_client_error', code: (error as NodeJS.ErrnoException).code ?? 'UNKNOWN' }));
    });
  }

  async checkout(): Promise<DatabaseLease> {
    if (this.#closed) throw new KernelError('DB_UNAVAILABLE', 'Database is shutting down', 503);
    if (this.#pool.waitingCount >= this.#config.profile.runtime.pool.maxWaiting) {
      throw new KernelError('DB_BUSY', 'Database pool queue is full', 503);
    }
    let client: PoolClient;
    try {
      client = await this.#pool.connect();
    } catch (error) {
      if (this.#config.managedJobTransport === true
          && typeof error === 'object' && error !== null
          && 'code' in error && error.code === 'DB_AUTH_UNAVAILABLE') throw error;
      throw new KernelError('DB_UNAVAILABLE', 'Database checkout failed', 503, { cause: error });
    }
    if (this.#closed) {
      client.release(true);
      throw new KernelError('DB_UNAVAILABLE', 'Database is shutting down', 503);
    }
    if (this.#config.env === 'managed') {
      try { await prepareManagedDatabaseSession(client, this.#config.binding, 'runtime'); }
      catch {
        client.release(true);
        throw new KernelError('DB_BOUNDARY_INVALID', 'Managed database session was rejected', 503);
      }
      if (this.#closed) {
        client.release(true);
        throw new KernelError('DB_UNAVAILABLE', 'Database is shutting down', 503);
      }
    }
    let released = false;
    return {
      client,
      release(destroy = false) {
        if (released) return;
        released = true;
        client.release(destroy);
      },
    };
  }

  async assertRuntimeBoundary(expected: readonly ExpectedMigration[]): Promise<void> {
    const lease = await this.checkout();
    try {
      const identity = await lease.client.query<{
        database_name: string; role_name: string; is_superuser: boolean; bypass_rls: boolean;
      }>(`
        SELECT current_database() AS database_name, current_user AS role_name,
               r.rolsuper AS is_superuser, r.rolbypassrls AS bypass_rls
          FROM pg_catalog.pg_roles AS r WHERE r.rolname = current_user
      `);
      const role = identity.rows[0];
      if (!role || role.database_name !== this.#config.binding.databaseName
          || role.role_name !== this.#config.binding.runtimeRole || role.is_superuser || role.bypass_rls) {
        throw new KernelError('DB_BOUNDARY_INVALID', 'Runtime database identity mismatch', 503);
      }
      const metadata = await lease.client.query<{
        app_key: string; kernel_contract_version: number; database_name: string;
      }>('SELECT app_key, kernel_contract_version, database_name FROM projed_core.runtime_metadata WHERE id = 1');
      const marker = metadata.rows[0];
      if (!marker || marker.app_key !== 'projed' || marker.kernel_contract_version !== 1
          || marker.database_name !== this.#config.binding.databaseName) {
        throw new KernelError('DB_BOUNDARY_INVALID', 'Runtime marker mismatch', 503);
      }
      const ledger = await lease.client.query<{ version: string; checksum: string }>(
        'SELECT version, checksum FROM projed_core.schema_migrations ORDER BY version',
      );
      if (ledger.rows.length !== expected.length
          || expected.some((item, index) => ledger.rows[index]?.version !== item.version
            || ledger.rows[index]?.checksum !== item.checksum)) {
        throw new KernelError('DB_BOUNDARY_INVALID', 'Migration ledger mismatch', 503);
      }
    } catch (error) {
      lease.release(!(error instanceof KernelError));
      if (error instanceof KernelError) throw error;
      throw new KernelError('DB_BOUNDARY_INVALID', 'Runtime database boundary check failed', 503, { cause: error });
    }
    lease.release();
  }

  async readiness(expected: readonly ExpectedMigration[]): Promise<boolean> {
    let lease: DatabaseLease | undefined;
    let releaseAttempted = false;
    try {
      lease = await this.checkout();
      const result = await lease.client.query<{ ok: boolean }>(`
        SELECT current_database() = $1
          AND current_user = $2
          AND EXISTS (
            SELECT 1 FROM projed_core.runtime_metadata
             WHERE id = 1 AND app_key = 'projed' AND kernel_contract_version = 1 AND database_name = $1
          )
          AND (
            SELECT COALESCE(
              jsonb_agg(jsonb_build_array(version, checksum) ORDER BY version),
              '[]'::jsonb
            ) = $3::jsonb
            FROM projed_core.schema_migrations
          ) AS ok
      `, [
        this.#config.binding.databaseName,
        this.#config.binding.runtimeRole,
        JSON.stringify(expected.map(({ version, checksum }) => [version, checksum])),
      ]);
      releaseAttempted = true;
      lease.release();
      return result.rows[0]?.ok === true;
    } catch {
      if (lease && !releaseAttempted) {
        releaseAttempted = true;
        try {
          lease.release(true);
        } catch {
          // Readiness must remain a boolean even when lease cleanup fails.
        }
      }
      return false;
    }
  }

  async end(): Promise<void> {
    this.#closed = true;
    await this.#pool.end();
  }
}
