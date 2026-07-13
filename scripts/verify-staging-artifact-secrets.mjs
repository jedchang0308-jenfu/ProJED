import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { loadEnv } from 'vite';

const root = process.cwd();
const distDir = resolve(root, 'dist');
const local = loadEnv('development', root, '');
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.map', '.txt', '.webmanifest']);
const credentialKeys = ['VITE_SUPABASE_TEST_EMAIL', 'VITE_SUPABASE_TEST_PASSWORD'];

const listTextFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return listTextFiles(path);
  return textExtensions.has(extname(entry.name).toLowerCase()) ? [path] : [];
});

const files = existsSync(distDir) ? listTextFiles(distDir) : [];
const checks = credentialKeys.map((key) => {
  const value = local[key]?.trim() || '';
  const matches = value.length >= 6
    ? files.filter((file) => readFileSync(file, 'utf8').includes(value))
    : [];
  return {
    key,
    configuredLocally: Boolean(value),
    absentFromArtifact: matches.length === 0,
    matchingFiles: matches.map((file) => file.slice(distDir.length + 1)),
  };
});

const result = {
  ok: existsSync(distDir) && files.length > 0 && checks.every((check) => check.absentFromArtifact),
  distExists: existsSync(distDir),
  scannedTextFiles: files.length,
  checks,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
