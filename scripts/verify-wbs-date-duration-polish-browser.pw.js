/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4000/', { waitUntil: 'networkidle' });
  const fixedTestButton = page.locator('button', { hasText: '使用固定測試環境' }).first();
  if (await fixedTestButton.count()) {
    await fixedTestButton.click();
  }
  const modeTrigger = page.locator('[data-mode-switcher-trigger="true"]').first();
  await modeTrigger.waitFor({ state: 'visible', timeout: 15000 });
  await modeTrigger.click();
  await page.locator('[data-mode-switcher-value="list"]').click();
  await page.locator('[data-mobile-pan-surface="wbs-list"]').waitFor({ state: 'visible', timeout: 15000 });

  const metrics = await page.evaluate(() => {
    const dates = Array.from(document.querySelectorAll('[data-wbs-list-date-control]'));
    const durations = Array.from(document.querySelectorAll('[data-wbs-list-duration-control]'));
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, width: box.width, height: box.height };
    };
    return {
      dateCount: dates.length,
      durationCount: durations.length,
      dateRects: dates.slice(0, 4).map(rect),
      durationRects: durations.slice(0, 4).map(rect),
      inputHeights: Array.from(document.querySelectorAll('[data-wbs-list-date-control] input, [data-wbs-list-duration-control] input, [data-wbs-list-duration-control] button'))
        .slice(0, 8)
        .map(element => ({ type: element.tagName.toLowerCase(), height: element.getBoundingClientRect().height })),
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  assert(metrics.dateCount > 0, 'WBS list should render date controls', metrics);
  assert(metrics.durationCount > 0, 'WBS list should render duration controls', metrics);
  assert(metrics.inputHeights.every(item => Math.abs(item.height - 30) <= 1), 'date and duration controls should share one height', metrics);
  assert(metrics.bodyScrollWidth <= metrics.viewportWidth + 1, 'WBS list should not create body overflow', metrics);
  await page.screenshot({ path: 'output/playwright/wbs-date-duration-polish.png', fullPage: true });
  return metrics;
}
