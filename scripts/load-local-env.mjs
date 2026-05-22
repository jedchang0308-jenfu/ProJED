import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const requestedEnv =
  process.env.PROJED_ENV ||
  process.env.APP_ENV ||
  (process.env.NODE_ENV === 'test' ? 'test' : undefined);

const envFiles = [
  ...(requestedEnv ? [`.env.${requestedEnv}.local`, `.env.${requestedEnv}`] : []),
  '.env.p8.local',
  '.env.local',
  '.env.development.local',
  '.env.production.local',
  '.env',
];

const unquote = (value) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const parseEnvLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const powerShellMatch = trimmed.match(/^\$env:([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (powerShellMatch) {
    return [powerShellMatch[1], unquote(powerShellMatch[2])];
  }

  const dotenvMatch = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (dotenvMatch) {
    return [dotenvMatch[1], unquote(dotenvMatch[2])];
  }

  return null;
};

for (const envFile of envFiles) {
  const fullPath = path.resolve(process.cwd(), envFile);
  if (!existsSync(fullPath)) continue;

  const content = readFileSync(fullPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;

    const [key, value] = parsed;
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const aliases = [
  ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
  ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'],
  ['SUPABASE_AUTH_REDIRECT_URL', 'VITE_SUPABASE_AUTH_REDIRECT_URL'],
];

for (const [target, source] of aliases) {
  if (!process.env[target] && process.env[source]) {
    process.env[target] = process.env[source];
  }
}
