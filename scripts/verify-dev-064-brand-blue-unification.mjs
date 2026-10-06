import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok: Boolean(ok), ...(details ? { details } : {}) });

const files = {
  css: 'src/index.css',
  brandColors: 'src/components/ui/brandColors.ts',
  relationshipGeometry: 'src/components/MindMap/mindMapGeometry.ts',
  relationshipOverlay: 'src/components/MindMap/MindMapRelationshipOverlay.tsx',
  dragPreview: 'src/components/MindMap/MindMapDragPreviewLayer.tsx',
  workbench: 'src/components/TaskWorkbenchPanel.tsx',
  compactTokens: 'src/components/ui/compactTokens.ts',
  statusFilterBar: 'src/components/ui/StatusFilterBar.tsx',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-064-brand-blue-unification.md',
  qa: 'ai-doc/qa/QA-DEV-064-brand-blue-unification.md',
};

for (const [key, relativePath] of Object.entries(files)) {
  assert(`file exists:${key}`, fs.existsSync(path.join(root, relativePath)), relativePath);
}

const css = read(files.css);
const brandColors = read(files.brandColors);
const geometry = read(files.relationshipGeometry);
const overlay = read(files.relationshipOverlay);
const dragPreview = read(files.dragPreview);
const workbench = read(files.workbench);
const compactTokens = read(files.compactTokens);
const statusFilterBar = read(files.statusFilterBar);
const pkg = read(files.packageJson);
const spec = read(files.spec);
const qa = read(files.qa);

const palette = {
  50: '#eef2ff',
  100: '#e0e7ff',
  200: '#c7d2fe',
  300: '#a5b4fc',
  400: '#818cf8',
  500: '#6366f1',
  600: '#4f46e5',
  700: '#4338ca',
  800: '#3730a3',
  900: '#312e81',
  950: '#1e1b4b',
};

assert(
  'CSS and non-CSS brand palette share one authoritative color scale',
  css.includes('@theme static {') &&
  Object.entries(palette).every(([shade, value]) =>
    css.includes(`--color-primary-${shade}: ${value};`) &&
    brandColors.includes(`${shade}: '${value}'`),
  ),
);

assert(
  'legacy blue-like Tailwind families resolve to the same brand scale',
  ['blue', 'sky', 'indigo', 'cyan'].every(family =>
    Object.keys(palette).every(shade =>
      css.includes(`--color-${family}-${shade}: var(--color-primary-${shade});`),
    ),
  ),
);

assert(
  'primary aliases and in-progress status use the brand scale',
  css.includes('--color-primary: var(--color-primary-500);') &&
    css.includes('--color-primary-hover: var(--color-primary-600);') &&
    css.includes('--color-primary-light: var(--color-primary-50);') &&
    css.includes('--color-status-in-progress: var(--color-primary-600);'),
);

const sourceFiles = [];
const walk = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolutePath);
    else if (/\.(?:ts|tsx|css)$/.test(entry.name)) sourceFiles.push(absolutePath);
  }
};
walk(path.join(root, 'src'));

const legacyBlueLiteral = /#(?:0284c7|0ea5e9|38bdf8|bae6fd|2563eb|3b82f6|60a5fa|93c5fd|bfdbfe|dbeafe|eff6ff)|rgba\((?:125,211,252|37,99,235|59,130,246)/i;
const blueGrayLiteral = /#(?:304a5c|324756|536b7b|607789|7893a4|a9bbc8|b7c5cf|c2d0d8|c3ccd2|c7d1d8|cbd5dc|e1e9ee|e4ebef|e4ecf1|e6edf2|e7eef2|e8eef2|edf3f6|eef3f6|f1f5f7|f2f5f7|f7f9fa|fbfcfc)/i;
const legacyLiteralOffenders = sourceFiles
  .filter(filePath => !filePath.endsWith(path.normalize(files.brandColors)))
  .filter(filePath => legacyBlueLiteral.test(fs.readFileSync(filePath, 'utf8')))
  .map(filePath => path.relative(root, filePath));
const blueGrayOffenders = sourceFiles
  .filter(filePath => blueGrayLiteral.test(fs.readFileSync(filePath, 'utf8')))
  .map(filePath => path.relative(root, filePath));

assert('legacy hard-coded blue literals are isolated to the compatibility normalizer', legacyLiteralOffenders.length === 0, legacyLiteralOffenders);
assert('blue-gray pseudo-brand literals are removed from product source', blueGrayOffenders.length === 0, blueGrayOffenders);

assert(
  'mind-map SVG and persisted legacy relationship blue use BRAND_BLUE',
  geometry.includes("import { BRAND_BLUE, normalizeLegacyBrandBlue }") &&
    geometry.includes('strokeColor: BRAND_BLUE[500]') &&
    geometry.includes('strokeColor: normalizeLegacyBrandBlue(style?.strokeColor)') &&
    overlay.includes("import { BRAND_BLUE }") &&
    overlay.includes('stroke={active ? BRAND_BLUE[500] : path.style.strokeColor}') &&
    dragPreview.includes('stroke={BRAND_BLUE[600]}'),
);

assert(
  'task workbench and shared topbar use neutral slate surfaces with brand-blue active states',
  workbench.includes("isOver ? 'bg-primary/10 ring-2 ring-inset ring-primary/30' : ''") &&
    workbench.includes("isPlacedBoardLaneOver ? 'bg-primary/10 ring-2 ring-inset ring-primary/30' : ''") &&
    workbench.includes('rounded-md border border-slate-600 bg-slate-700') &&
    workbench.includes('text-white') &&
    !workbench.includes('bg-slate-200/95') &&
    workbench.includes('bg-primary') &&
     compactTokens.includes('border-slate-300 bg-white text-slate-600') &&
     statusFilterBar.includes('border-primary/30') &&
     statusFilterBar.includes('bg-primary/') &&
     statusFilterBar.includes('text-primary'),
);

assert(
  'DEV-064 static and browser verifiers are registered',
  pkg.includes('"verify:dev-064-brand-blue-unification"') &&
    pkg.includes('"verify:dev-064-brand-blue-unification-browser"'),
);

assert(
  'PM contract preserves semantic colors and defines brand-blue acceptance',
  spec.includes('品牌藍 500：`#6366F1`') &&
    spec.includes('成功綠、警告橘、危險紅與中性灰不納入品牌藍替換') &&
    qa.includes('QA-064-001') &&
    qa.includes('QA-064-006'),
);

const summary = {
  pass: results.filter(result => result.ok).length,
  fail: results.filter(result => !result.ok).length,
};

console.log(JSON.stringify({ ok: summary.fail === 0, summary, results }, null, 2));
if (summary.fail > 0) process.exitCode = 1;
