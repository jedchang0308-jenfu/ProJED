/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const openApp = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((account) => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
    }, account);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mode-switcher-value="mindmap"]').click();
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-note-relationship-overlay]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const nodeByTitle = (title) => page.locator(`[data-mindmap-node-title="${title}"]`).first();
  const selectedNode = () => page.locator('[data-mindmap-node][aria-selected="true"]').first();
  const titleInput = () => page.locator('[data-mindmap-title-input]').first();
  const relationshipPathByLabel = (label) => page.locator(`[data-mindmap-note-relationship-path][data-label="${label}"]`).first();
  const relationshipGroupByLabel = (label) => page.locator(`[data-mindmap-note-relationship][data-label="${label}"]`).first();

  const assertNoVisibleErrors = async (label) => {
    const bodyText = await page.locator('body').innerText();
    const visibleError = [
      'Internal Server Error',
      'HTTP 4',
      'HTTP 5',
      'Not Found',
      'TypeError',
      'ReferenceError',
      'Unhandled Runtime Error',
    ].find(pattern => bodyText.includes(pattern));
    assert(!visibleError, `${label} should not show visible runtime errors`, { visibleError });
  };

  const renameSelectedByTyping = async (title) => {
    await selectedNode().focus();
    await page.keyboard.press('D');
    await titleInput().waitFor({ state: 'visible', timeout: 10000 });
    await titleInput().fill(title);
    await titleInput().press('Enter');
    await nodeByTitle(title).waitFor({ state: 'visible', timeout: 10000 });
  };

  const createRoot = async (title) => {
    await page.locator('[data-mindmap-create-root]').click();
    await selectedNode().waitFor({ state: 'visible', timeout: 10000 });
    await renameSelectedByTyping(title);
  };

  const createNoteRelationship = async (fromTitle, toTitle, label) => {
    await nodeByTitle(fromTitle).click();
    const sourceId = await nodeByTitle(fromTitle).getAttribute('data-mindmap-node');
    await page.locator('[data-mindmap-note-relationship-tool]').click();
    await page.locator(`[data-mindmap-note-relationship-tool][data-active="true"][data-source-node-id="${sourceId}"]`).waitFor({ state: 'visible', timeout: 10000 });
    await nodeByTitle(toTitle).click();
    const editor = page.locator('[data-mindmap-note-relationship-label-input]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await editor.fill(label);
    await page.keyboard.press('Enter');
    await relationshipPathByLabel(label).waitFor({ state: 'visible', timeout: 10000 });
  };

  const clickRelationship = async (label, eventType = 'click') => {
    const target = page.locator(`[data-mindmap-note-relationship-click-target][data-label="${label}"]`).first();
    await target.waitFor({ state: 'attached', timeout: 10000 });
    if (eventType === 'dblclick') {
      await target.dblclick({ force: true });
    } else {
      await target.click({ force: true });
    }
  };

  await openApp();
  await assertNoVisibleErrors('DEV-027C initial');

  const stamp = Date.now().toString(36);
  const source = `DEV027C source ${stamp}`;
  const target = `DEV027C target ${stamp}`;
  const pruneTarget = `DEV027C prune target ${stamp}`;
  const label = `note link ${stamp}`;
  const editedLabel = `edited note ${stamp}`;
  const pruneLabel = `prune note ${stamp}`;

  await createRoot(source);
  await createRoot(target);
  await createRoot(pruneTarget);

  await createNoteRelationship(source, target, label);

  const pathMeta = await relationshipPathByLabel(label).evaluate((path) => ({
    d: path.getAttribute('d'),
    stroke: path.getAttribute('stroke'),
    strokeDasharray: path.getAttribute('stroke-dasharray'),
    markerEnd: path.getAttribute('marker-end'),
    fromX: Number(path.getAttribute('data-from-x')),
    fromY: Number(path.getAttribute('data-from-y')),
    toX: Number(path.getAttribute('data-to-x')),
    toY: Number(path.getAttribute('data-to-y')),
  }));
  assert(pathMeta.d?.includes(' C '), 'note relationship should render a dashed Xmind-like path', { pathMeta });
  assert(pathMeta.strokeDasharray === '7 6', 'note relationship path should use Xmind-like dashed stroke', { pathMeta });
  assert(pathMeta.markerEnd?.includes('mindmap-note-relationship-arrow'), 'note relationship should render arrow marker', { pathMeta });
  assert(Number.isFinite(pathMeta.fromX) && Number.isFinite(pathMeta.toX), 'note relationship should expose endpoint geometry', { pathMeta });

  const labelText = await page.locator(`[data-mindmap-note-relationship-label]`).filter({ hasText: label }).count();
  assert(labelText > 0, 'note relationship label should render the typed text', { label });
  const localRelationship = await page.evaluate((label) => {
    const key = Object.keys(localStorage).find(item => item.startsWith('projed.mindmap.noteRelationships.'));
    const stored = key ? JSON.parse(localStorage.getItem(key) || '[]') : [];
    return stored.find(item => item.label === label) || null;
  }, label);
  assert(localRelationship && !('fromSide' in localRelationship) && !('toSide' in localRelationship), 'note relationship should persist as note-only data without dependency fields', { localRelationship });

  await clickRelationship(label);
  await page.waitForFunction((label) => {
    return document.querySelector(`[data-mindmap-note-relationship][data-label="${label}"]`)?.getAttribute('data-selected') === 'true';
  }, label);
  const selected = await relationshipGroupByLabel(label).getAttribute('data-selected');
  assert(selected === 'true', 'clicking note relationship should select it', { selected });
  const relationshipId = await relationshipGroupByLabel(label).getAttribute('data-mindmap-note-relationship');
  const endpointCount = await page.locator(`[data-relationship-id="${relationshipId}"][data-mindmap-note-relationship-endpoint]`).count();
  assert(endpointCount === 2, 'note relationship should render two endpoint handles', { endpointCount });

  await clickRelationship(label, 'dblclick');
  await page.locator('[data-mindmap-note-relationship-label-input]').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-mindmap-note-relationship-label-input]').fill(editedLabel);
  await page.keyboard.press('Enter');
  await relationshipPathByLabel(editedLabel).waitFor({ state: 'visible', timeout: 10000 });
  assert(await relationshipPathByLabel(label).count() === 0, 'double-clicking note relationship should edit label', { label, editedLabel });

  await clickRelationship(editedLabel);
  await page.locator('[data-mindmap-view]').focus();
  await page.keyboard.press('Delete');
  await relationshipPathByLabel(editedLabel).waitFor({ state: 'hidden', timeout: 10000 });
  assert(await relationshipPathByLabel(editedLabel).count() === 0, 'Delete should remove the selected note relationship', { editedLabel });

  await createNoteRelationship(source, pruneTarget, pruneLabel);
  await relationshipPathByLabel(pruneLabel).waitFor({ state: 'visible', timeout: 10000 });
  await nodeByTitle(pruneTarget).click();
  await page.locator('[data-mindmap-view]').focus();
  await page.keyboard.press('Delete');
  await nodeByTitle(pruneTarget).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
  await relationshipPathByLabel(pruneLabel).waitFor({ state: 'hidden', timeout: 10000 });
  assert(await relationshipPathByLabel(pruneLabel).count() === 0, 'archiving an endpoint should prune incomplete note relationships', { pruneLabel });

  await assertNoVisibleErrors('DEV-027C final');
}
