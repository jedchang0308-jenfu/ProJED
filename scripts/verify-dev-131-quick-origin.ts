import assert from 'node:assert/strict';
import { getQuickInstallUrl, getWorkbenchUrl, isMainProductionOrigin, isQuickProductionOrigin } from '../src/features/quickTaskCapture/origins';

const main = 'https://projed-cc78d.web.app';
const quick = 'https://projed-cc78d.firebaseapp.com';
const preview = 'https://projed-cc78d--level3-smoke-test.web.app';

assert.equal(getQuickInstallUrl(main), `${quick}/quick-task/?install=1`);
assert.equal(getQuickInstallUrl(quick), '/quick-task/?install=1');
assert.equal(getQuickInstallUrl(preview), '/quick-task/?install=1');
assert.equal(getQuickInstallUrl('http://localhost:4000'), '/quick-task/?install=1');
assert.equal(getWorkbenchUrl(quick), `${main}/?quick_workbench=1`);
assert.equal(getWorkbenchUrl(main), '/?quick_workbench=1');
assert.equal(getWorkbenchUrl(preview), '/?quick_workbench=1');
assert.equal(isMainProductionOrigin(main), true);
assert.equal(isMainProductionOrigin(quick), false);
assert.equal(isQuickProductionOrigin(quick), true);
assert.equal(isQuickProductionOrigin(main), false);

console.log('DEV-131 dual-origin routing: PASS');
