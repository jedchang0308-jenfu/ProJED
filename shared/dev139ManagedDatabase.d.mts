export type ManagedPurpose = 'runtime' | 'migrator' | 'importer';
export interface ManagedIamLogins { runtime: string; migrator: string; importer: string }
export interface ManagedBinding {
  databaseName: string; databasePort: number; runtimeRole: string;
  connectionMode?: string; cloudSqlInstance?: string; iamLogins?: ManagedIamLogins;
}
export const MANAGED_DATABASE: Readonly<{
  host: 'cloud-sql-iam'; cloudSqlInstance: string; databaseName: string; databasePort: number;
  iamLogins: Readonly<ManagedIamLogins>;
  roles: Readonly<{ owner: string; migrator: string; importer: string; runtime: string }>;
}>;
export function assertManagedIamLogins(value: unknown): asserts value is ManagedIamLogins;
export function validateManagedDatabaseUrl(raw: string, binding: ManagedBinding, purpose: ManagedPurpose): URL;
export function validateManagedRuntimeJobDatabaseUrl(raw: string, binding: ManagedBinding): URL;
export function fetchManagedJobToken(fetchImpl?: typeof fetch): Promise<string>;
export function managedJobConnectionOptions(raw: string, binding: ManagedBinding, purpose: ManagedPurpose, token: string): {
  host: string; port: number; database: string; user: string; password: string; ssl: false;
};
export function managedRuntimeJobConnectionOptions(
  raw: string,
  binding: ManagedBinding,
  tokenProvider?: () => Promise<string>,
): {
  host: string; port: number; database: string; user: string; password: () => Promise<string>; ssl: false;
};
export function prepareManagedDatabaseSession(client: {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}, binding: ManagedBinding, purpose: ManagedPurpose): Promise<void>;
