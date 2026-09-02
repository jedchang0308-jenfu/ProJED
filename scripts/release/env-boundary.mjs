import fs from 'node:fs';
import path from 'node:path';
import {
  PRODUCTION_CONTRACT,
  PUBLIC_ENV_KEYS,
  SERVER_ONLY_KEYS,
  isCanonicalRedirect,
  isProductionSupabaseUrl,
  isSafeHttpsFeed,
} from './production-contract.mjs';

const readText = filePath => fs.readFileSync(filePath, 'utf8');

export function parseDotenv(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  }
  return result;
}

export function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return parseDotenv(readText(filePath));
}

const unique = values => [...new Set(values)];
const present = value => typeof value === 'string' && value.length > 0;

const resolveAuthorityPath = (root, explicitPath, fallbackName) => explicitPath
  ? path.resolve(root, explicitPath)
  : path.join(root, fallbackName);

export function resolveProductionPublicEnv({ root = process.cwd(), parentEnv = process.env, envPath: explicitEnvPath } = {}) {
  const envPath = resolveAuthorityPath(root, explicitEnvPath, '.env.production');
  const localPath = path.join(root, '.env.production.local');
  if (!fs.existsSync(envPath)) throw new Error('RELEASE P0: production public env authority file is missing.');
  const env = readEnvFile(envPath);
  const errors = [];
  for (const key of PRODUCTION_CONTRACT.publicRequiredKeys) {
    if (!present(env[key])) errors.push(`missing ${key}`);
  }
  for (const [key, expected] of Object.entries(PRODUCTION_CONTRACT.fixedPublicValues)) {
    if ((env[key] ?? '') !== expected) errors.push(`${key} must equal the sealed production value`);
  }
  if (!isProductionSupabaseUrl(env.VITE_SUPABASE_URL)) errors.push('VITE_SUPABASE_URL must target the production Supabase project');
  if (!isCanonicalRedirect(env.VITE_SUPABASE_AUTH_REDIRECT_URL)) errors.push('VITE_SUPABASE_AUTH_REDIRECT_URL must be the canonical production redirect');
  if (env.VITE_PROJED_APP_URL && env.VITE_PROJED_APP_URL !== PRODUCTION_CONTRACT.canonicalOrigin) errors.push('VITE_PROJED_APP_URL must equal the canonical production origin');
  if (!isSafeHttpsFeed(env.VITE_GOOGLE_CALENDAR_FEED_URL)) errors.push('VITE_GOOGLE_CALENDAR_FEED_URL must be HTTPS and non-loopback');
  const local = readEnvFile(localPath);
  const localConflicts = Object.keys(local).filter(key => PUBLIC_ENV_KEYS.includes(key));
  if (localConflicts.length > 0) errors.push(`.env.production.local must not define release-controlled public keys (${localConflicts.join(', ')})`);
  const parentVite = Object.keys(parentEnv).filter(key => key.startsWith('VITE_'));
  const unexpectedParent = parentVite.filter(key => !PUBLIC_ENV_KEYS.includes(key));
  if (unexpectedParent.length > 0) errors.push(`parent process contains non-contract VITE keys (${unexpectedParent.join(', ')})`);
  const conflictingParent = parentVite.filter(key => PUBLIC_ENV_KEYS.includes(key) && parentEnv[key] !== env[key]);
  if (conflictingParent.length > 0) errors.push(`parent process conflicts with .env.production for ${conflictingParent.join(', ')}`);
  if (errors.length > 0) throw new Error(`RELEASE P0 production env boundary failed: ${errors.join('; ')}`);
  return Object.fromEntries(PUBLIC_ENV_KEYS.filter(key => key in env).map(key => [key, env[key]]));
}

export function buildSanitizedChildEnv(parentEnv = process.env, { publicEnv = {}, releaseEnvDir, releaseId, extra = {} } = {}) {
  const keep = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'ComSpec', 'PATHEXT', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'CI', 'NO_COLOR', 'npm_config_user_agent', 'npm_config_cache'];
  const sanitized = Object.fromEntries(keep.filter(key => parentEnv[key] !== undefined).map(key => [key, parentEnv[key]]));
  for (const key of Object.keys(sanitized)) {
    if (key.startsWith('VITE_') || key.startsWith('SUPABASE_') || key.includes('GEMINI')) delete sanitized[key];
  }
  Object.assign(sanitized, publicEnv, extra);
  if (releaseEnvDir || releaseId || Object.keys(publicEnv).length > 0) sanitized.PROJED_RELEASE_PROFILE = 'production';
  if (releaseEnvDir) sanitized.PROJED_RELEASE_ENV_DIR = releaseEnvDir;
  if (releaseId) sanitized.PROJED_RELEASE_ID = releaseId;
  return sanitized;
}

export function loadServerVerificationEnv({ root = process.cwd(), parentEnv = process.env, envPath: explicitEnvPath } = {}) {
  const fileEnv = readEnvFile(resolveAuthorityPath(root, explicitEnvPath, '.env.p8.local'));
  const verificationKeys = [...SERVER_ONLY_KEYS, 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_AUTH_REDIRECT_URL', 'SUPABASE_CREDENTIAL_ROTATION_VERIFIED', 'P8_CREDENTIAL_ROTATION_VERIFIED', 'P7_CREDENTIAL_ROTATION_CONFIRMED', 'OLD_SUPABASE_ANON_KEY', 'OLD_SUPABASE_SERVICE_ROLE_KEY', 'OLD_SUPABASE_ACCESS_TOKEN', 'P8_OLD_SUPABASE_ANON_KEY', 'P8_OLD_SUPABASE_SERVICE_ROLE_KEY', 'P8_OLD_SUPABASE_ACCESS_TOKEN'];
  const result = {};
  for (const key of verificationKeys) {
    if (parentEnv[key] !== undefined) result[key] = parentEnv[key];
    else if (fileEnv[key] !== undefined) result[key] = fileEnv[key];
  }
  return result;
}

export function collectTestPublicForbiddenValues({ root = process.cwd(), productionEnvPath } = {}) {
  const files = ['.env.test.local', '.env.local', '.env.staging.local'];
  const keys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_AUTH_REDIRECT_URL', 'VITE_GOOGLE_CLIENT_ID', 'VITE_SUPABASE_TEST_EMAIL', 'VITE_SUPABASE_TEST_PASSWORD'];
  const production = readEnvFile(resolveAuthorityPath(root, productionEnvPath, '.env.production'));
  const productionValues = new Set(keys.map(key => production[key]).filter(present));
  const values = [];
  for (const file of files) {
    const env = readEnvFile(path.join(root, file));
    for (const key of keys) if (present(env[key])) values.push(env[key]);
  }
  return unique(values.filter(value => value.length >= 4 && !productionValues.has(value)));
}

export function assertNoServerKeys(env = {}) {
  const leaked = SERVER_ONLY_KEYS.filter(key => present(env[key]));
  if (leaked.length > 0) throw new Error(`RELEASE P0 server-only keys leaked into client build environment: ${leaked.join(', ')}`);
}
