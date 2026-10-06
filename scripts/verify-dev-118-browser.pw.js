/* eslint-disable */
async (page) => {
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  const fixedTestButton = page.getByRole('button', { name: /使用固定測試環境/ });
  if (await fixedTestButton.count() && await fixedTestButton.isVisible().catch(() => false)) {
    await fixedTestButton.click({ force: true });
  }
  const trigger = page.locator('#filter-menu-trigger');
  await trigger.waitFor({ state: 'visible', timeout: 15000 });
  await trigger.click();
  const panel = page.locator('[data-filter-menu-panel]');
  await panel.waitFor({ state: 'visible', timeout: 5000 });
  const checks = await panel.evaluate(element => ({
    sharedControls: Boolean(element.querySelector('[data-task-condition-filter-controls="true"]')),
    hasPositiveStatusLabel: element.textContent?.includes('任務狀態') ?? false,
    hasDueLabel: element.textContent?.includes('到期日與關鍵字') ?? false,
    hasDueDaysPlaceholder: Boolean(element.querySelector('input[aria-label="到期天數"][placeholder]')),
    hasPeopleLabel: element.textContent?.includes('負責人/協作') ?? false,
    hasTagLabel: element.textContent?.includes('標籤') ?? false,
  }));
  if (!checks.sharedControls || !checks.hasPositiveStatusLabel || !checks.hasDueLabel || checks.hasDueDaysPlaceholder || !checks.hasPeopleLabel || !checks.hasTagLabel) {
    throw new Error(JSON.stringify(checks));
  }
  console.log(JSON.stringify({ ok: true, checks }));
}
