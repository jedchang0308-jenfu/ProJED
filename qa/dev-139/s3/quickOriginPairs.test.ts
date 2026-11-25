import assert from 'node:assert/strict';
import test from 'node:test';
import { getMainInstallUrl, getQuickCaptureUrl, getQuickInstallUrl, getWorkbenchUrl,
  isMainProductionOrigin, isQuickProductionOrigin } from '../../../src/features/quickTaskCapture/origins';

test('old and new entry pairs retain independent Quick origins without redirecting the legacy pair', () => {
  for (const [main, quick] of [
    ['https://projed-cc78d.web.app', 'https://projed-cc78d.firebaseapp.com'],
    ['https://projed-prod-9536592944.asia-east1.run.app', 'https://projed-prod-56gnizku7q-de.a.run.app'],
  ] as const) {
    assert.equal(getQuickCaptureUrl(main), `${quick}/quick-task/`);
    assert.equal(getQuickInstallUrl(main), `${quick}/quick-task/?install=1`);
    assert.equal(getMainInstallUrl(quick), `${main}/`);
    assert.equal(getWorkbenchUrl(quick), `${main}/?quick_workbench=1`);
    assert.equal(isMainProductionOrigin(main), true); assert.equal(isQuickProductionOrigin(main), false);
    assert.equal(isQuickProductionOrigin(quick), true); assert.equal(isMainProductionOrigin(quick), false);
  }
});

test('local and lookalike origins never acquire the independent production Quick Session entry', () => {
  for (const origin of ['http://127.0.0.1:1040', 'https://projed-prod-56gnizku7q-de.a.run.app.evil.test',
    'https://projed-prod-56gnizku7q-de.a.run.app/quick-task/']) {
    assert.equal(isQuickProductionOrigin(origin), false); assert.equal(isMainProductionOrigin(origin), false);
    assert.equal(getQuickCaptureUrl(origin), '/quick-task/');
    assert.equal(getMainInstallUrl(origin), '/');
  }
});
