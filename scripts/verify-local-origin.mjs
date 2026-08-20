import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const canonicalOrigin = 'http://localhost:4000/';
const legacyOrigin = 'http://127.0.0.1' + ':4000';
const excludedDirectoryNames = new Set(['.git', 'node_modules', 'dist', 'build', 'output']);

const toRelative = (filePath) => path.relative(root, filePath).replaceAll(path.sep, '/');

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectoryNames.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

const explicitFiles = [
  'package.json',
  '.env.test.example',
  '.env.test.local',
  'README.md',
  'scripts/local-test-server.ps1',
];

const scanPaths = [
  ...explicitFiles,
  ...(await collectFiles(path.join(root, 'scripts'))).map(toRelative),
  ...(await collectFiles(path.join(root, 'src'))).map(toRelative),
];

const uniquePaths = [...new Set(scanPaths)];
const staleReferences = [];
const readErrors = [];

for (const relativePath of uniquePaths) {
  const filePath = path.join(root, relativePath);
  let contents;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      readErrors.push(`${relativePath}: ${error.message}`);
    }
    continue;
  }

  if (contents.includes(legacyOrigin)) {
    staleReferences.push(relativePath);
  }
}

const requiredChecks = [];
const packageJson = await readFile(path.join(root, 'package.json'), 'utf8');
const testEnvExample = await readFile(path.join(root, '.env.test.example'), 'utf8');
const serverScript = await readFile(path.join(root, 'scripts/local-test-server.ps1'), 'utf8');

requiredChecks.push({
  name: 'package scripts use canonical browser origin',
  ok: packageJson.includes(canonicalOrigin) && !packageJson.includes(legacyOrigin),
});
requiredChecks.push({
  name: 'test env redirect uses canonical origin',
  ok: testEnvExample.includes(`VITE_SUPABASE_AUTH_REDIRECT_URL=${canonicalOrigin}`),
});
requiredChecks.push({
  name: 'server status URL is canonical while bind remains configurable',
  ok: serverScript.includes('$CanonicalHostName = "localhost"') && serverScript.includes('$Url = "http://${CanonicalHostName}:${Port}/"'),
});

const failedChecks = requiredChecks.filter((check) => !check.ok).map((check) => check.name);
const ok = staleReferences.length === 0 && readErrors.length === 0 && failedChecks.length === 0;
const result = {
  ok,
  canonicalOrigin,
  scannedFiles: uniquePaths.length,
  staleReferences,
  failedChecks,
  readErrors,
};

console.log(JSON.stringify(result, null, 2));
if (!ok) {
  process.exit(1);
}
