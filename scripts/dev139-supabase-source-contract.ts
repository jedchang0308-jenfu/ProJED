import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export interface SupabaseSourceBindingV1 {
  bindingVersion: 1;
  provider: 'supabase-postgres';
  projectRef: string;
  connectionMode: 'direct' | 'session';
  hostname: string;
  port: 5432;
  databaseName: string;
  readerRole: string;
  sslMode: 'verify-full';
  sslRootCertSha256: string;
}

const PROJECT_REF_RE = /^[a-z0-9]{20}$/;
const DNS_RE = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const DATABASE_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;
const ROLE_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ALLOWED_KEYS = new Set([
  'bindingVersion', 'provider', 'projectRef', 'connectionMode', 'hostname', 'port',
  'databaseName', 'readerRole', 'sslMode', 'sslRootCertSha256',
]);

function fail(message: string): never {
  throw Object.assign(new Error(message), { code: 'SOURCE_BINDING_INVALID' });
}

export function sha256Bytes(bytes: NodeJS.ArrayBufferView): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function validateSupabaseSourceBinding(value: unknown): SupabaseSourceBindingV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Source binding must be an object');
  const binding = value as Partial<SupabaseSourceBindingV1> & Record<string, unknown>;
  if (Object.keys(binding).some(key => !ALLOWED_KEYS.has(key))) fail('Source binding contains an unknown field');
  if (binding.bindingVersion !== 1 || binding.provider !== 'supabase-postgres'
      || !PROJECT_REF_RE.test(binding.projectRef ?? '')
      || (binding.connectionMode !== 'direct' && binding.connectionMode !== 'session')
      || typeof binding.hostname !== 'string' || binding.hostname !== binding.hostname.toLowerCase()
      || !DNS_RE.test(binding.hostname)
      || binding.port !== 5432
      || !DATABASE_RE.test(binding.databaseName ?? '')
      || typeof binding.readerRole !== 'string' || !ROLE_RE.test(binding.readerRole)
      || binding.sslMode !== 'verify-full'
      || !SHA256_RE.test(binding.sslRootCertSha256 ?? '')) {
    fail('Source binding does not match the Supabase migration contract');
  }
  if (binding.connectionMode === 'direct') {
    if (binding.hostname !== `db.${binding.projectRef}.supabase.co`) fail('Direct source hostname does not match the project ref');
  } else if (!/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(binding.hostname)
      || !binding.readerRole.endsWith(`.${binding.projectRef}`)) {
    fail('Session pooler host or reader role does not match the project ref');
  }
  return Object.freeze(binding as unknown as SupabaseSourceBindingV1);
}

export function deriveSupabaseSourceDatabaseRole(binding: SupabaseSourceBindingV1): string {
  if (binding.connectionMode === 'direct') return binding.readerRole;

  const poolerSuffix = `.${binding.projectRef}`;
  if (!binding.readerRole.endsWith(poolerSuffix)) fail('Session pooler reader role does not match the project ref');
  const databaseRole = binding.readerRole.slice(0, -poolerSuffix.length);
  if (!databaseRole) fail('Session pooler reader role has no database role');
  return databaseRole;
}

export function validateSupabaseSourceUrl(raw: string, binding: SupabaseSourceBindingV1): string {
  let url: URL;
  try { url = new URL(raw); }
  catch (error) { throw Object.assign(new Error('Supabase source URL is invalid', { cause: error }), { code: 'SOURCE_URL_INVALID' }); }
  const queryKeys = [...url.searchParams.keys()].sort();
  const certificatePath = url.searchParams.get('sslrootcert') ?? '';
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || url.hostname !== binding.hostname
      || Number(url.port || '5432') !== binding.port
      || decodeURIComponent(url.pathname.slice(1)) !== binding.databaseName
      || decodeURIComponent(url.username) !== binding.readerRole
      || url.password.length === 0 || url.hash !== ''
      || queryKeys.join('|') !== 'sslmode|sslrootcert'
      || url.searchParams.get('sslmode') !== binding.sslMode
      || !isAbsolute(certificatePath)) {
    throw Object.assign(new Error('Supabase source URL is outside its exact binding'), { code: 'SOURCE_URL_INVALID' });
  }
  try {
    const resolvedCertificate = realpathSync(certificatePath);
    if (!statSync(resolvedCertificate).isFile()
        || sha256Bytes(readFileSync(resolvedCertificate)) !== binding.sslRootCertSha256) {
      throw new Error('certificate mismatch');
    }
  } catch (error) {
    throw Object.assign(new Error('Supabase source CA does not match its binding', { cause: error }), {
      code: 'SOURCE_CA_INVALID',
    });
  }
  return raw;
}
