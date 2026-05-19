import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-ssr',
  '.firebase',
  '.vite',
]);

const ignoredFiles = new Set([
  'package-lock.json',
]);

const textExtensions = new Set([
  '.cjs',
  '.css',
  '.env',
  '.example',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
]);

const supabaseAccessTokenRe = /\bsbp_[A-Za-z0-9_-]{20,}\b/g;
const supabaseSecretKeyRe = /\bsb_secret_[A-Za-z0-9_-]{8,}/g;
const jwtLikeRe = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

const decodeJwtPayload = (token) => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

const shouldReadFile = (filePath) => {
  const basename = path.basename(filePath);
  const extension = path.extname(filePath);
  return !ignoredFiles.has(basename) && textExtensions.has(extension);
};

const walk = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...await walk(fullPath));
      }
      continue;
    }

    if (entry.isFile() && shouldReadFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
};

const findings = [];
const files = await walk(root);

for (const file of files) {
  const content = await fs.readFile(file, 'utf8');
  const relativePath = path.relative(root, file);

  for (const match of content.matchAll(supabaseAccessTokenRe)) {
    findings.push({ file: relativePath, index: match.index, type: 'supabase_access_token' });
  }

  for (const match of content.matchAll(supabaseSecretKeyRe)) {
    findings.push({ file: relativePath, index: match.index, type: 'supabase_secret_key' });
  }

  for (const match of content.matchAll(jwtLikeRe)) {
    const payload = decodeJwtPayload(match[0]);
    if (payload?.iss === 'supabase' || payload?.role === 'service_role') {
      findings.push({
        file: relativePath,
        index: match.index,
        type: payload.role === 'service_role' ? 'supabase_service_role_jwt' : 'supabase_jwt',
      });
    }
  }
}

if (findings.length > 0) {
  console.error('Supabase secret hygiene check failed. Potential secrets found in tracked workspace files:');
  for (const finding of findings) {
    console.error(`- ${finding.type} in ${finding.file} at byte ${finding.index}`);
  }
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  scanned_files: files.length,
  findings: 0,
}, null, 2));
