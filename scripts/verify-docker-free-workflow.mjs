import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');

const dailyRoots = ['dev:local', 'verify:source'];

const dockerAliases = {
  'verify:docker:dev-123-auth-storage': 'verify:dev-123-auth-storage-local',
  'verify:docker:dev-123-control-api': 'verify:dev-123-control-api-local',
  'verify:docker:dev-045-calendar-db': 'verify:dev-045-calendar-subscription-local-db-smoke',
  'verify:docker:dev-047-backup': 'verify:dev-047-backup-local-supabase',
};

const directDockerScripts = Object.values(dockerAliases);
const transitiveDockerScripts = [
  'verify:dev-123-local-preflight',
  'verify:dev-047-backup-package',
];

const forbiddenCommandPatterns = [
  { label: 'Docker CLI', pattern: /(^|[\s;&|])docker(?:\.exe|\.cmd)?(?=\s|$)/i },
  {
    label: 'local Supabase runtime',
    pattern: /\b(?:npx(?:\.cmd)?\s+)?supabase\s+(?:start|stop|status)\b/i,
  },
  {
    label: 'local Supabase database runtime',
    pattern: /\b(?:npx(?:\.cmd)?\s+)?supabase\s+db\s+(?:reset|lint)\b/i,
  },
];

const forbiddenSourcePatterns = [
  { label: 'Docker CLI', pattern: /^\s*(?:&\s*)?docker(?:\.exe|\.cmd)?(?:\s|$)/im },
  {
    label: 'Docker child process',
    pattern: /\b(?:spawnSync|spawn|execFileSync|execFile)\s*\(\s*['"`]docker(?:\.exe)?['"`]/i,
  },
  {
    label: 'local Supabase runtime',
    pattern: /^\s*(?:&\s*)?(?:npx(?:\.cmd)?\s+)?supabase\s+(?:start|stop|status)\b/im,
  },
  {
    label: 'local Supabase database runtime',
    pattern: /^\s*(?:&\s*)?(?:npx(?:\.cmd)?\s+)?supabase\s+db\s+(?:reset|lint)\b/im,
  },
];

function extractNpmRunDependencies(command) {
  const dependencies = [];
  const pattern = /\bnpm(?:\.cmd)?\s+run\s+([^\s&|]+)/gi;
  let match;

  while ((match = pattern.exec(command)) !== null) {
    dependencies.push(match[1].replace(/^['"]|['"]$/g, ''));
  }

  return dependencies;
}

function resolveScriptGraph(scripts, roots) {
  const resolved = new Set();
  const missing = new Set();
  const pending = [...roots];

  while (pending.length > 0) {
    const name = pending.shift();
    if (resolved.has(name)) continue;

    const command = scripts[name];
    if (typeof command !== 'string') {
      missing.add(name);
      continue;
    }

    resolved.add(name);
    for (const dependency of extractNpmRunDependencies(command)) {
      if (!resolved.has(dependency)) pending.push(dependency);
    }
  }

  return { resolved: [...resolved], missing: [...missing] };
}

function findForbiddenCommand(command) {
  return forbiddenCommandPatterns
    .filter(({ pattern }) => pattern.test(command))
    .map(({ label }) => label);
}

function extractReferencedFiles(command) {
  const matches = command.match(/(?:\.\/[\\/]?)?scripts[\\/][A-Za-z0-9._/\\-]+\.(?:mjs|cjs|js|ts|ps1)/gi) ?? [];
  return matches.map((value) => value.replace(/^\.\//, '').replaceAll('\\', '/'));
}

async function inspectReferencedFiles(scripts, graph) {
  const references = new Set();
  const failures = [];

  for (const name of graph) {
    for (const reference of extractReferencedFiles(scripts[name])) references.add(reference);
  }

  for (const reference of references) {
    const absolutePath = path.resolve(projectRoot, reference);
    let source;

    try {
      source = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      failures.push(`${reference}: cannot read referenced file (${error.code ?? error.message})`);
      continue;
    }

    const matches = forbiddenSourcePatterns
      .filter(({ pattern }) => pattern.test(source))
      .map(({ label }) => label);

    if (matches.length > 0) {
      failures.push(`${reference}: invokes ${matches.join(', ')}`);
    }
  }

  return { references: [...references].sort(), failures };
}

function verifySelfTests() {
  const failures = [];

  const directMock = { 'dev:local': 'docker compose up' };
  if (findForbiddenCommand(directMock['dev:local']).length === 0) {
    failures.push('self-test did not detect a direct Docker command');
  }

  const transitiveMock = {
    'dev:local': 'npm run verify:dev-123-auth-storage-local',
    'verify:dev-123-auth-storage-local': 'echo isolated mock',
  };
  const transitiveGraph = resolveScriptGraph(transitiveMock, ['dev:local']).resolved;
  if (!transitiveGraph.some((name) => directDockerScripts.includes(name))) {
    failures.push('self-test did not detect a transitive Docker-only script');
  }

  return failures;
}

async function main() {
  const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  const scripts = packageJson.scripts ?? {};
  const failures = [];

  if (scripts['verify:daily'] !== 'npm run verify:daily:contract && npm run verify:source') {
    failures.push('verify:daily must run the Docker-free contract before verify:source');
  }

  const { resolved, missing } = resolveScriptGraph(scripts, dailyRoots);
  for (const name of missing) failures.push(`missing daily script: ${name}`);

  const forbiddenScriptSet = new Set([...directDockerScripts, ...transitiveDockerScripts]);
  for (const name of resolved) {
    if (forbiddenScriptSet.has(name)) failures.push(`daily graph includes Docker-only script: ${name}`);

    for (const label of findForbiddenCommand(scripts[name])) {
      failures.push(`${name}: command invokes ${label}`);
    }
  }

  for (const [alias, target] of Object.entries(dockerAliases)) {
    if (scripts[alias] !== `npm run ${target}`) {
      failures.push(`${alias}: must point only to ${target}`);
    }
  }

  const fileInspection = await inspectReferencedFiles(scripts, resolved);
  failures.push(...fileInspection.failures);

  const selfTestRequested = process.argv.includes('--self-test');
  const selfTestFailures = selfTestRequested ? verifySelfTests() : [];
  failures.push(...selfTestFailures);

  const report = {
    status: failures.length === 0 ? 'pass' : 'fail',
    policy: 'daily development is Docker-free; Docker/Supabase local stack checks are explicit on-demand exceptions',
    dailyEntrypoints: ['npm run dev:local', 'npm run verify:daily'],
    checkedScriptGraph: resolved.sort(),
    checkedFiles: fileInspection.references,
    dockerExceptions: {
      direct: directDockerScripts,
      transitive: transitiveDockerScripts,
      aliases: Object.keys(dockerAliases),
    },
    selfTest: selfTestRequested ? (selfTestFailures.length === 0 ? 'pass' : 'fail') : 'not-requested',
    failures,
  };

  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

await main();
