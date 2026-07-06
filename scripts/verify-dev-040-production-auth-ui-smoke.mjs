import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const PRODUCTION_URL = 'https://projed-cc78d.web.app/';

const parseEnvFile = (file) => {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
};

const quoteWindowsArg = (value) => {
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
};

const run = (command, args, env = {}) => new Promise((resolve) => {
  const childCommand = process.platform === 'win32' ? 'cmd.exe' : command;
  const childArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', [command, ...args].map(quoteWindowsArg).join(' ')]
    : args;
  const child = spawn(childCommand, childArgs, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    shell: false,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });
  child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
});

const parsePlaywrightRawJson = (stdout) => {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error('Playwright did not return stdout.');
  try {
    return JSON.parse(JSON.parse(trimmed));
  } catch {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Unable to parse Playwright stdout: ${error.message}\n${trimmed.slice(0, 1000)}`);
    }
  }
};

const prodEnv = parseEnvFile('.env.production');
const p8Env = parseEnvFile('.env.p8.local');
const supabaseUrl = prodEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = prodEnv.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = p8Env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Missing production Supabase smoke env keys.');
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const storageKey = `sb-${projectRef}-auth-token`;
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `dev040-prod-ui-${suffix}@example.invalid`;
const password = `Dev040-${suffix}-Aa1!`;

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const userClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const assertOk = (label, result) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

let cleanup = {};
let smokeFile = null;

try {
  const created = assertOk(
    'admin.createUser',
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: 'DEV-040 Production UI Smoke' },
    })
  );
  const userId = created.user.id;
  cleanup.userId = userId;

  const signIn = assertOk(
    'signInWithPassword',
    await userClient.auth.signInWithPassword({ email, password })
  );

  assertOk(
    'profile upsert',
    await userClient
      .from('profiles')
      .upsert({ id: userId, email, display_name: 'DEV-040 Production UI Smoke' })
      .select()
      .single()
  );

  const tenant = assertOk(
    'create_tenant_with_owner',
    await userClient.rpc('create_tenant_with_owner', {
      tenant_name: `DEV-040 Production UI Smoke ${suffix}`,
    })
  );
  cleanup.tenantId = tenant.id;

  const projectA = assertOk(
    'project A insert',
    await userClient
      .from('projects')
      .insert({
        tenant_id: tenant.id,
        legacy_board_id: `dev040-prod-board-a-${suffix}`,
        name: 'DEV-040 A 看板',
        sort_order: 1,
      })
      .select()
      .single()
  );
  const projectB = assertOk(
    'project B insert',
    await userClient
      .from('projects')
      .insert({
        tenant_id: tenant.id,
        legacy_board_id: `dev040-prod-board-b-${suffix}`,
        name: 'DEV-040 B 看板',
        sort_order: 2,
      })
      .select()
      .single()
  );

  const task = assertOk(
    'wbs task insert',
    await userClient
      .from('wbs_items')
      .insert({
        tenant_id: tenant.id,
        project_id: projectA.id,
        legacy_node_id: `dev040-prod-task-${suffix}`,
        title: 'DEV-040 正式環境 activity 任務',
        status: 'todo',
        item_type: 'task',
        sort_order: 1,
      })
      .select()
      .single()
  );

  assertOk(
    'activity insert',
    await userClient
      .from('activity_events')
      .insert({
        tenant_id: tenant.id,
        project_id: projectA.id,
        actor_id: userId,
        event_type: 'task_created',
        entity_table: 'wbs_items',
        entity_id: task.id,
        payload: { title: task.title, nodeId: task.id },
      })
      .select()
      .single()
  );

  const payload = {
    storageKey,
    session: signIn.session,
  };

  const sessionName = `prod-dev040-${suffix}`;
  const open = await run('npx.cmd', [
    '--yes',
    '--package',
    '@playwright/cli',
    'playwright-cli',
    `-s=${sessionName}`,
    'open',
    PRODUCTION_URL,
  ]);
  if (open.code !== 0) {
    throw new Error(`Playwright open failed:\n${open.stderr || open.stdout}`);
  }

  const smokeCodeTemplate = String.raw`
async (page) => {
  const payload = __PROD_SMOKE_PAYLOAD__;
  const messages = [];
  const pageErrors = [];
  const failed = [];
  page.on('console', msg => messages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('requestfailed', req => failed.push({ url: req.url(), failure: req.failure()?.errorText }));
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('https://projed-cc78d.web.app/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: payload.storageKey,
    session: payload.session,
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: /DEV-040 A 看板/ }).first().click();
  await page.waitForTimeout(1500);
  const meetingEntry = page.locator('button', { hasText: '新增會議記錄' }).first();
  await meetingEntry.waitFor({ state: 'visible', timeout: 20000 });
  const appLoadedText = await page.locator('body').innerText({ timeout: 5000 });

  await meetingEntry.click();
  await page.waitForTimeout(1000);
  if (!(await page.locator('[data-record-composer-workflow]').count())) {
    const activeMeetingButton = page.locator('nav [data-active-record-kind="meeting"]').first();
    if (await activeMeetingButton.count()) {
      await activeMeetingButton.click();
    } else {
      const activeRecordButton = page.locator('nav button', { hasText: '紀錄中' }).first();
      if (await activeRecordButton.count()) await activeRecordButton.click();
    }
  }
  await page.locator('[data-record-composer-close][aria-label="離開紀錄"]').waitFor({ state: 'visible', timeout: 15000 });
  const projectImportStep = page.locator('[data-meeting-workflow-step="project_import"]').first();
  if (await projectImportStep.count()) {
    await projectImportStep.click();
  } else {
    const fallbackImportStep = page.getByRole('button', { name: /匯入|設定匯入/ }).first();
    if (await fallbackImportStep.count()) {
      await fallbackImportStep.click();
    } else {
      const debug = await page.evaluate(() => ({
        bodyText: document.body.innerText.slice(0, 1200),
        buttons: Array.from(document.querySelectorAll('button')).map(button => button.textContent?.trim()).filter(Boolean).slice(0, 80),
        workflowCount: document.querySelectorAll('[data-record-composer-workflow]').length,
        meetingStepCount: document.querySelectorAll('[data-meeting-workflow-step]').length,
        workLogStepCount: document.querySelectorAll('[data-work-log-workflow-step]').length,
      }));
      return JSON.stringify({
        ok: false,
        stage: 'project_import_step_missing',
        debug,
      }, null, 2);
    }
  }
  await page.locator('[data-project-change-import-panel]').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-project-change-import-panel] button', { hasText: '整理專案變化' }).click();
  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-project-change-import-panel]');
    const text = panel?.textContent || '';
    const previewButton = Array.from(panel?.querySelectorAll('button') || [])
      .find(button => button.textContent?.includes('整理專案變化'));
    return Boolean(previewButton) && !previewButton.disabled && !text.includes('正在整理');
  }, null, { timeout: 45000 });
  const importPanelText = await page.locator('[data-project-change-import-panel]').innerText();

  await page.locator('[data-record-composer-close]').click();
  const dialogs = page.locator('.global-dialog-content');
  if (await dialogs.count()) {
    await dialogs.locator('button', { hasText: /直接離開|不儲存，繼續|取消/ }).first().click().catch(() => {});
  }
  await page.waitForTimeout(1000);

  const panel = page.locator('[data-task-workbench-panel="true"]');
  if (!(await panel.count())) {
    const navEntry = page.locator('[data-mobile-task-workbench-nav-entry="true"]').first();
    if (await navEntry.count()) await navEntry.click();
  }
  await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 15000 });
  const workbench = page.locator('[data-task-workbench-panel="true"]');
  await workbench.locator('[data-task-workbench-unclassified-input="true"]').fill('DEV-040 正式未歸位任務');
  await workbench.locator('[data-task-workbench-unclassified-add="true"]').click();
  await workbench.locator('[data-task-workbench-unplaced-task-card="true"]', { hasText: 'DEV-040 正式未歸位任務' }).waitFor({ state: 'visible', timeout: 10000 });

  const boardButtons = page.locator('aside button, nav button').filter({ hasText: /DEV-040 [AB] 看板/ });
  if (await boardButtons.count() >= 2) {
    await boardButtons.nth(1).click();
    await page.waitForTimeout(1500);
    await boardButtons.nth(0).click();
    await page.waitForTimeout(1500);
  }
  const unplacedAfterSwitch = await workbench.locator('[data-task-workbench-unplaced-task-card="true"]', { hasText: 'DEV-040 正式未歸位任務' }).count();
  if (unplacedAfterSwitch !== 1) throw new Error('unplaced task count after board switch=' + unplacedAfterSwitch);

  const criticalMessages = messages.filter(m => m.type === 'error' && !/favicon|ResizeObserver/i.test(m.text));
  return JSON.stringify({
    ok: true,
    appLoaded: /新增會議記錄/.test(appLoadedText),
    projectImportText: importPanelText.slice(0, 220),
    projectImportResolved: !importPanelText.includes('正在整理'),
    unplacedAfterSwitch,
    criticalMessages,
    pageErrors,
    failed: failed.filter(f => !/fonts\.gstatic|googleapis/.test(f.url)),
  }, null, 2);
}`;
  const smokeCode = smokeCodeTemplate.replace('__PROD_SMOKE_PAYLOAD__', JSON.stringify(payload));
  mkdirSync('tmp', { recursive: true });
  smokeFile = `tmp/dev040-production-auth-ui-smoke-${suffix}.pw.js`;
  writeFileSync(smokeFile, smokeCode, 'utf8');

  const runSmoke = await run(
    'npx.cmd',
    [
      '--yes',
      '--package',
      '@playwright/cli',
      'playwright-cli',
      `-s=${sessionName}`,
      'run-code',
      '--raw',
      `--filename=${smokeFile}`,
    ]
  );
  if (runSmoke.code !== 0) {
    throw new Error(`Production authenticated UI smoke failed:\n${runSmoke.stdout}\n${runSmoke.stderr}`);
  }

  const browser = parsePlaywrightRawJson(runSmoke.stdout);
  const report = {
    ok: true,
    production_url: PRODUCTION_URL,
    project_ref: projectRef,
    setup: {
      temporary_user_created: true,
      temporary_tenant_created: true,
      board_count: 2,
      activity_event_seeded: true,
    },
    browser,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!browser.ok) {
    throw new Error(`Production authenticated UI smoke did not pass at ${browser.stage || 'unknown stage'}.`);
  }
} finally {
  if (smokeFile) {
    rmSync(smokeFile, { force: true });
  }
  const cleanupResult = { tenantDeleted: false, userDeleted: false };
  if (cleanup.tenantId) {
    const { error } = await admin.from('tenants').delete().eq('id', cleanup.tenantId);
    if (error) cleanupResult.tenantDeleteError = error.message;
    else cleanupResult.tenantDeleted = true;
  }
  if (cleanup.userId) {
    const { error } = await admin.auth.admin.deleteUser(cleanup.userId);
    if (error) cleanupResult.userDeleteError = error.message;
    else cleanupResult.userDeleted = true;
  }
  console.log(JSON.stringify({ cleanup: cleanupResult }, null, 2));
}
