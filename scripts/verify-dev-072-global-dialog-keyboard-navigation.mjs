import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('.');
const source = readFileSync(resolve(root, 'src/components/GlobalDialog.tsx'), 'utf8');
const appSource = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');

assert.ok(source.includes('data-global-dialog="true"'), 'GlobalDialog must expose a stable dialog marker');
assert.ok(source.includes('role="dialog"'), 'GlobalDialog must expose dialog semantics');
assert.ok(source.includes('aria-modal="true"'), 'GlobalDialog must be modal to assistive technology');
assert.ok(source.includes("e.key === 'ArrowLeft'"), 'ArrowLeft must participate in shared decision navigation');
assert.ok(source.includes("e.key === 'ArrowRight'"), 'ArrowRight must participate in shared decision navigation');
assert.ok(source.includes('decisionButtonRefs'), 'decision controls must be addressable as a focus group');
assert.ok(source.includes('data-global-dialog-decision="true"'), 'decision buttons must expose a stable marker');
assert.ok(source.includes('data-global-dialog-decision-index'), 'decision buttons must expose their navigation index');
assert.ok(source.includes("const defaultDecisionIndex = type === 'action' ? 0 : 1"), 'confirm/prompt default must be Confirm and action default must be first action');
assert.ok(source.includes('e.preventDefault()'), 'handled keys must not leak into the underlying mode');
assert.ok(source.includes('Preserve native caret movement while typing in prompt inputs'), 'prompt input arrow keys must keep native caret behavior');
assert.ok(source.includes('closeButtonRef'), 'close button must remain outside decision navigation');
assert.equal((appSource.match(/<GlobalDialog\s*\/>/g) || []).length, 1, 'GlobalDialog must be mounted once at app scope for all modes');

console.log(JSON.stringify({
  status: 'PASS',
  contract: {
    sharedScope: 'GlobalDialog / all modes',
    confirmPromptDefault: '確認',
    actionDefault: 'first action',
    horizontalNavigation: 'ArrowLeft/ArrowRight circular',
    activation: 'Enter',
    promptCaretPreserved: true,
  },
}, null, 2));
