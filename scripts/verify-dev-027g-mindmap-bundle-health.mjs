import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const checks = [];
const check = (name, ok, details = undefined) => {
  checks.push({ name, ok: Boolean(ok), ...(details === undefined ? {} : { details }) });
};

const stripAnsi = (text) => {
  const escape = String.fromCharCode(27);
  let output = '';
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== escape) {
      output += text[index];
      continue;
    }
    index += 1;
    if (text[index] !== '[') continue;
    while (index < text.length && !/[A-Za-z]/.test(text[index])) {
      index += 1;
    }
  }
  return output;
};

const firestoreSync = read('src/hooks/useFirestoreSync.ts');
const viteConfig = read('vite.config.js');
const app = read('src/App.tsx');

check(
  'useFirestoreSync uses the existing static useWbsStore import instead of dynamically importing the same store',
  firestoreSync.includes("import { useWbsStore } from '../store/useWbsStore';") &&
    firestoreSync.includes('useWbsStore.getState().setNodes(nodes);') &&
    !firestoreSync.includes("import('../store/useWbsStore')"),
);

check(
  'Vite build defines manual vendor chunks for large shared dependencies',
  [
    'manualChunks(id)',
    "return 'vendor-firebase'",
    "return 'vendor-supabase'",
    "return 'vendor-editor'",
    "return 'vendor-dnd'",
    "return 'vendor-react'",
    "return 'vendor-icons'",
  ].every(token => viteConfig.includes(token)),
);

check(
  'App code-splits non-home workspace views instead of bundling every view into the initial app chunk',
  app.includes("import { lazy, Suspense, useEffect, useRef } from 'react';") &&
    [
      "const MindMapView = lazy(() => import('./components/MindMap/MindMapView'))",
      "const BoardView = lazy(() => import('./components/BoardView'))",
      "const GanttView = lazy(() => import('./components/GanttView'))",
      "const CalendarView = lazy(() => import('./components/CalendarView'))",
      "const RecordsView = lazy(() => import('./components/Records/RecordsView'))",
      '<Suspense fallback=',
    ].every(token => app.includes(token)) &&
    [
      "import MindMapView from './components/MindMap/MindMapView'",
      "import BoardView from './components/BoardView'",
      "import GanttView from './components/GanttView'",
      "import CalendarView from './components/CalendarView'",
      "import RecordsView from './components/Records/RecordsView'",
    ].every(token => !app.includes(token)),
);

const build = spawnSync('cmd.exe', ['/c', 'npm.cmd', 'run', 'build'], {
  cwd: root,
  encoding: 'utf8',
  shell: false,
  maxBuffer: 20 * 1024 * 1024,
});
const output = `${build.stdout || ''}\n${build.stderr || ''}`;
const plainOutput = stripAnsi(output);
const appChunkMatch = plainOutput.match(/assets\/index-[^\s]+\.js\s+([0-9.]+) kB/);
const appChunkKb = appChunkMatch ? Number(appChunkMatch[1]) : Number.POSITIVE_INFINITY;

check('production build exits successfully', build.status === 0, {
  status: build.status,
  signal: build.signal,
  error: build.error?.message,
});
check(
  'production build no longer reports useWbsStore mixed static/dynamic import warning',
  !output.includes('useWbsStore.ts is dynamically imported') &&
    !output.includes('dynamic import will not move module into another chunk'),
);
check(
  'production build no longer reports chunks larger than 500 kB',
  !output.includes('Some chunks are larger than 500 kB after minification'),
);
check(
  'production build keeps the initial app chunk below the default Vite 500 kB warning threshold',
  Number.isFinite(appChunkKb) && appChunkKb < 500,
  { appChunkKb },
);
check(
  'production build no longer reports circular manual chunks',
  !output.includes('Circular chunk:'),
);
check(
  'production build emits explicit vendor chunks',
  [
    'vendor-react',
    'vendor-firebase',
    'vendor-supabase',
    'vendor-editor',
  ].every(token => output.includes(token)),
);

const failed = checks.filter(result => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: {
    pass: checks.length - failed.length,
    fail: failed.length,
  },
  checks,
}, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
