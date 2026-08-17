/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const viewports = [
    { width: 1440, height: 900, name: 'desktop' },
    { width: 1024, height: 768, name: 'laptop' },
    { width: 390, height: 844, name: 'mobile' },
  ];
  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const baseUrl = 'http://127.0.0.1:4000/';

  const visibleErrors = async () => page.locator('.inline-error, [role="alert"]').allTextContents();
  const artifacts = [];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate((session) => {
      localStorage.setItem('projed-local-test.selected-account', session.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(session));
    }, account);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    const errors = await visibleErrors();
    assert(errors.length === 0, `DEV-070 ${viewport.name} visible error sweep failed`, { errors });
    const bodyText = await page.locator('body').innerText();
    assert(!/DEV-070|profile layer|source layer|raw action id/i.test(bodyText), `DEV-070 ${viewport.name} leaked internal interaction metadata`);
    const screenshotPath = `output/playwright/dev-070/${viewport.name}-1440-contract.png`.replace('1440', `${viewport.width}`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    artifacts.push({ viewport: viewport.name, width: viewport.width, height: viewport.height, screenshotPath, errors });
  }
  console.log(`DEV070_ARTIFACT=${JSON.stringify({ schemaVersion: 1, fixtureId: 'dev-070-v1', artifacts })}`);
}
