import assert from 'node:assert/strict';
import { assertTaskActionCatalog, getTaskMenuActionIds } from '../src/interactions/task/taskActionCatalog';
import { assertTaskInteractionMigrationManifest, canAdvanceTaskInteractionMigration } from '../src/interactions/task/migrationManifest';
import { resolveTaskInteraction, resolveTaskMenu } from '../src/interactions/task/resolveTaskInteraction';
import { createTaskCommandExecutor } from '../src/interactions/task/taskCommandExecutor';
import type { InteractionContext } from '../src/interactions/task/types';

const baseContext: InteractionContext = {
  interactionId: 'dev-070-static-1',
  location: { hostMode: 'board', origin: 'mode-primary' },
  surfaceId: 'board.card',
  taskId: 'dev070-card-a',
  nodeRole: 'task',
  modality: 'fine-pointer',
  transientOwners: [],
  blockers: [],
};

assertTaskActionCatalog();
assertTaskInteractionMigrationManifest();
assert.equal(resolveTaskInteraction(baseContext, 'pointer.primary').actionId, 'task.open-details');
assert.equal(resolveTaskInteraction({ ...baseContext, location: { hostMode: 'calendar', origin: 'mode-primary' }, surfaceId: 'calendar.segment' }, 'pointer.primary').actionId, 'task.switch-to-list');
assert.equal(resolveTaskInteraction({ ...baseContext, location: { hostMode: 'mindmap', origin: 'mode-primary' }, surfaceId: 'mindmap.node' }, 'keyboard.enter').actionId, 'task.create-sibling');
assert.equal(resolveTaskInteraction({ ...baseContext, transientOwners: ['relationship'] }, 'pointer.primary').actionId, null);
assert.equal(resolveTaskInteraction({ ...baseContext, transientOwners: ['relationship', 'record-capture'] }, 'pointer.primary').suppressedReason, 'transient-owner-conflict');
assert.equal(resolveTaskInteraction({ ...baseContext, blockers: ['drag-established'] }, 'pointer.primary').suppressedReason, 'drag-established');
assert.equal(resolveTaskInteraction({ ...baseContext, transientOwners: ['mobile-action-mode'] }, 'task.post-create').actionId, 'task.open-details');
assert.equal(resolveTaskMenu({ ...baseContext, location: { hostMode: 'board', origin: 'mode-primary' } }).includes('task.dependency-start'), true);
assert.equal(resolveTaskMenu({ ...baseContext, location: { hostMode: 'mindmap', origin: 'mode-primary' } }).includes('task.dependency-start'), false);
assert.equal(getTaskMenuActionIds([{ menu: { exclude: ['task.delete-request'] } }]).includes('task.delete-request'), false);
assert.equal(canAdvanceTaskInteractionMigration('legacy-only', 'shadow-resolve'), true);
assert.equal(canAdvanceTaskInteractionMigration('legacy-only', 'legacy-removed'), false);

let commandCount = 0;
const executor = createTaskCommandExecutor({
  'task.toggle-complete': () => {
    commandCount += 1;
  },
}, { now: () => 1000 });
const guardInput = { nodeExists: true, canEditTask: true };
const first = await executor.execute(baseContext, 'task.toggle-complete', guardInput);
const duplicate = await executor.execute(baseContext, 'task.toggle-complete', guardInput);
assert.equal(first.status, 'executed');
assert.equal(duplicate.status, 'noop');
assert.equal(commandCount, 1);
const denied = await executor.execute({ ...baseContext, interactionId: 'dev-070-static-2' }, 'task.toggle-complete', { nodeExists: true, canEditTask: false });
assert.equal(denied.status, 'denied');
assert.equal(commandCount, 1);

console.log(JSON.stringify({
  verifier: 'dev-070-interaction-kernel',
  status: 'PASS',
  cases: 14,
  commandCount,
}));
