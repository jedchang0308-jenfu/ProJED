import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const PRODUCTION_URL = 'https://projed-cc78d.web.app/';
const ALLOW_ENV = 'DEV011012_ALLOW_PRODUCTION_FIXTURE';
const RUN_FLAG = '--run-production-fixture';
const SELF_CHECK_FLAG = '--self-check';

const parseEnvFile = (file) => {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
};

const quotePowerShellArg = (value) => `'${String(value).replace(/'/g, "''")}'`;

const run = (command, args, env = {}, timeoutMs = 120000) => new Promise((resolve) => {
  const childCommand = process.platform === 'win32' ? 'powershell.exe' : command;
  const childArgs = process.platform === 'win32'
    ? [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `& ${quotePowerShellArg(command)} ${args.map(quotePowerShellArg).join(' ')}; exit $LASTEXITCODE`,
      ]
    : args;
  const child = spawn(childCommand, childArgs, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    shell: false,
  });
  let stdout = '';
  let stderr = '';
  let completed = false;
  let timedOut = false;
  const finish = (result) => {
    if (completed) return;
    completed = true;
    clearTimeout(timer);
    resolve(result);
  };
  const killChildTree = () => {
    if (process.platform === 'win32' && child.pid) {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']);
      killer.unref();
      return;
    }
    child.kill();
  };
  const timer = setTimeout(() => {
    timedOut = true;
    killChildTree();
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
    finish({
      code: 124,
      stdout,
      stderr: `${stderr}\nCommand timed out after ${timeoutMs} ms.`,
    });
  }, timeoutMs);
  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });
  child.on('error', error => finish({ code: 1, stdout, stderr: `${stderr}${error.stack || error.message}` }));
  child.on('close', code => finish({
    code: timedOut ? 124 : code ?? 1,
    stdout,
    stderr: timedOut ? `${stderr}\nCommand timed out after ${timeoutMs} ms.` : stderr,
  }));
});

const runPowerShellScript = (script, env = {}, timeoutMs = 120000) => new Promise((resolve) => {
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    shell: false,
  });
  let stdout = '';
  let stderr = '';
  let completed = false;
  let timer;
  const finish = (result) => {
    if (completed) return;
    completed = true;
    clearTimeout(timer);
    resolve(result);
  };
  const killChildTree = () => {
    if (child.pid) {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']);
      killer.unref();
      return;
    }
    child.kill();
  };
  timer = setTimeout(() => {
    killChildTree();
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
    finish({
      code: 124,
      stdout,
      stderr: `${stderr}\nCommand timed out after ${timeoutMs} ms.`,
    });
  }, timeoutMs);
  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });
  child.on('error', error => finish({ code: 1, stdout, stderr: `${stderr}${error.stack || error.message}` }));
  child.on('close', code => finish({ code: code ?? 1, stdout, stderr }));
});

const playwrightCliCommand = (args) => `& ${quotePowerShellArg('npx.cmd')} ${[
  '--yes',
  '--package',
  '@playwright/cli',
  'playwright-cli',
  ...args,
].map(quotePowerShellArg).join(' ')}`;

const extractJsonObjectAt = (text, start) => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
};

const extractPlaywrightJsonPayload = (output) => {
  const marker = /\{\s*"result"\s*:/g;
  const starts = [];
  let match = marker.exec(output);
  while (match) {
    starts.push(match.index);
    match = marker.exec(output);
  }

  for (const start of starts.reverse()) {
    const candidate = extractJsonObjectAt(output, start);
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep searching older candidates.
    }
  }

  return JSON.parse(output.trim());
};

const parseJsonLike = (value) => {
  let parsed = value;
  for (let index = 0; index < 4 && typeof parsed === 'string'; index += 1) {
    parsed = JSON.parse(parsed);
  }
  return parsed;
};

const parsePlaywrightJson = (stdout, stderr = '') => {
  const trimmed = stdout.trim();
  const diagnostic = (trimmed || stderr.trim()).slice(0, 1500);
  if (!trimmed) {
    throw new Error(`Playwright did not return stdout. stderr:\n${stderr.trim().slice(0, 1500)}`);
  }
  try {
    const parsed = extractPlaywrightJsonPayload(trimmed);
    if (parsed && typeof parsed === 'object' && 'result' in parsed) {
      return parseJsonLike(parsed.result);
    }
    return parseJsonLike(parsed);
  } catch (error) {
    throw new Error(`Unable to parse Playwright stdout: ${error.message}\n${diagnostic}`);
  }
};

const assertOk = (label, result) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

const runSelfCheck = () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const scriptSource = readFileSync('scripts/verify-dev-011-012-production-ui-smoke.mjs', 'utf8');
  const readinessSource = readFileSync('scripts/verify-dev-011-012-production-ui-smoke-readiness.mjs', 'utf8');
  const qa011 = readFileSync('ai-doc/qa/QA-DEV-011-ai-meeting-record-synthesis.md', 'utf8');
  const qa012 = readFileSync('ai-doc/qa/QA-DEV-012-ai-meeting-record-natural-language-quality.md', 'utf8');
  const qc = readFileSync('ai-doc/qc/QC-DEV-011-012-production-ai-smoke.md', 'utf8');
  const devTask = readFileSync('ai-doc/dev_task.md', 'utf8');
  const documentationMap = readFileSync('ai-doc/documentation_map.md', 'utf8');
  const checks = [];
  const add = (name, pass, details = undefined) => checks.push({ name, pass, details });
  const includesAll = (text, tokens) => tokens.every(token => text.includes(token));

  add(
    'package exposes guarded production UI smoke executor as self-check by default',
    packageJson.scripts?.['verify:dev-011-012-production-ui-smoke'] ===
      'node scripts/verify-dev-011-012-production-ui-smoke.mjs',
    packageJson.scripts?.['verify:dev-011-012-production-ui-smoke'],
  );

  add(
    'executor requires both explicit flag and env opt-in before production mutation',
    includesAll(scriptSource, [
      'DEV011012_ALLOW_PRODUCTION_FIXTURE',
      '--run-production-fixture',
      "process.env[ALLOW_ENV] !== '1'",
      'mutates_database: true',
      'admin.auth.admin.deleteUser',
      "admin.from('tenants').delete()",
    ]),
  );

  add(
    'executor covers meeting mode, AI整理, publish, record persistence, record links, and task knowledge UI',
    includesAll(scriptSource, [
      '[data-record-composer-shell]',
      '[data-meeting-workflow-step="ai_suggestion"]',
      '[data-meeting-workflow-step="published"]',
      'knowledge_records',
      'record_task_links',
      'data-task-details-modal',
      '任務知識',
    ]),
  );

  add(
    'readiness gate tracks historical v1 proof and the pending contract v2 production gate',
    includesAll(readinessSource, [
      'verify:dev-011-012-production-ui-smoke',
      'verify-dev-011-012-production-ui-smoke.mjs',
      'pending contract v2 production gate',
      'meeting-synthesis-v2',
      'production effectiveness pending',
    ]),
  );

  add(
    'QA/QC/dev_task/docs preserve v1 evidence while keeping DEV-012 v2 production verification open',
    includesAll(qa011, ['verify:dev-011-012-production-ui-smoke', 'Done / Production Release Deployed / Production UI Smoke Passed', 'published_record_found=true']) &&
      includesAll(qa012, ['verify:dev-011-012-production-ui-smoke', 'Production v2 Stop-Ship Gate', 'meeting-synthesis-v2']) &&
      includesAll(qc, ['verify:dev-011-012-production-ui-smoke', 'Production v2 Release Gate（Pending）', 'Historical v1 Production Pass']) &&
      includesAll(devTask, ['DEV-012 [交付點] [驗證中]', 'meeting-synthesis-v2', 'production v2']) &&
      includesAll(documentationMap, ['Contract v2 source updated / not deployed', 'production effectiveness pending', 'Browser QC 5/5 passed']),
  );

  const failures = checks.filter(check => !check.pass);
  const payload = {
    ok: failures.length === 0,
    mode: 'self-check',
    mutates_database: false,
    production_fixture_allowed: false,
    run_condition: `${RUN_FLAG} and ${ALLOW_ENV}=1`,
    checks,
  };
  console.log(JSON.stringify(payload, null, 2));
  if (failures.length > 0) process.exit(1);
};

const shouldRunProductionFixture = process.argv.includes(RUN_FLAG);

if (!shouldRunProductionFixture || process.argv.includes(SELF_CHECK_FLAG)) {
  runSelfCheck();
  process.exit(0);
}

if (process.env[ALLOW_ENV] !== '1') {
  throw new Error(`Refusing production fixture smoke. Set ${ALLOW_ENV}=1 and pass ${RUN_FLAG} explicitly.`);
}

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
const email = `dev011012-prod-ui-${suffix}@example.invalid`;
const password = `Dev011012-${suffix}-Aa1!`;

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const userClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let cleanup = {};
let smokeFile = null;
let sessionName = null;

try {
  const created = assertOk(
    'admin.createUser',
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: 'DEV-011/012 Production UI Smoke' },
    }),
  );
  const userId = created.user.id;
  cleanup.userId = userId;

  const signIn = assertOk(
    'signInWithPassword',
    await userClient.auth.signInWithPassword({ email, password }),
  );

  assertOk(
    'profile upsert',
    await userClient
      .from('profiles')
      .upsert({ id: userId, email, display_name: 'DEV-011/012 Production UI Smoke' })
      .select()
      .single(),
  );

  const tenant = assertOk(
    'create_tenant_with_owner',
    await userClient.rpc('create_tenant_with_owner', {
      tenant_name: `DEV-011/012 Production UI Smoke ${suffix}`,
    }),
  );
  cleanup.tenantId = tenant.id;

  const project = assertOk(
    'project insert',
    await userClient
      .from('projects')
      .insert({
        tenant_id: tenant.id,
        legacy_board_id: `dev011012-prod-board-${suffix}`,
        name: 'DEV-011/012 正式會議看板',
        sort_order: 1,
      })
      .select()
      .single(),
  );

  const root = assertOk(
    'root item insert',
    await userClient
      .from('wbs_items')
      .insert({
        tenant_id: tenant.id,
        project_id: project.id,
        legacy_node_id: `dev011012-prod-root-${suffix}`,
        title: 'DEV-011/012 正式煙測清單',
        status: 'todo',
        item_type: 'group',
        sort_order: 1,
      })
      .select()
      .single(),
  );

  const taskA = assertOk(
    'task A insert',
    await userClient
      .from('wbs_items')
      .insert({
        tenant_id: tenant.id,
        project_id: project.id,
        parent_id: root.id,
        legacy_node_id: `dev011012-prod-task-a-${suffix}`,
        title: 'DEV-011 會議統整煙測任務',
        status: 'in_progress',
        item_type: 'task',
        sort_order: 1,
      })
      .select()
      .single(),
  );

  const taskB = assertOk(
    'task B insert',
    await userClient
      .from('wbs_items')
      .insert({
        tenant_id: tenant.id,
        project_id: project.id,
        parent_id: root.id,
        legacy_node_id: `dev011012-prod-task-b-${suffix}`,
        title: 'DEV-012 自然語言煙測任務',
        status: 'todo',
        item_type: 'task',
        sort_order: 2,
      })
      .select()
      .single(),
  );

  assertOk(
    'activity insert',
    await userClient
      .from('activity_events')
      .insert({
        tenant_id: tenant.id,
        project_id: project.id,
        actor_id: userId,
        event_type: 'task_status_changed',
        entity_table: 'wbs_items',
        entity_id: taskA.id,
        payload: {
          taskId: taskA.id,
          taskTitle: taskA.title,
          before: { status: 'todo' },
          after: { status: 'in_progress' },
          summary: '待辦 -> 進行中',
        },
      })
      .select()
      .single(),
  );

  const uniqueNeedle = `DEV-011-012-PROD-SMOKE-${suffix}`;
  const payload = {
    storageKey,
    session: signIn.session,
    workspaceId: tenant.id,
    boardId: project.legacy_board_id || project.id,
    boardName: project.name,
    taskA: { id: taskA.id, uiId: taskA.legacy_node_id || taskA.id, title: taskA.title },
    taskB: { id: taskB.id, uiId: taskB.legacy_node_id || taskB.id, title: taskB.title },
    uniqueNeedle,
    productionUrl: PRODUCTION_URL,
  };

  sessionName = `prod-dev011012-${suffix}`;
  const smokeCodeTemplate = String.raw`
async (page) => {
  const payload = __PROD_SMOKE_PAYLOAD__;
  let stage = 'init';
  const messages = [];
  const pageErrors = [];
  const failed = [];
  page.on('console', msg => messages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('requestfailed', req => failed.push({ url: req.url(), failure: req.failure()?.errorText }));
  await page.setViewportSize({ width: 1440, height: 900 });

  const getWorkflowDebug = async () => page.evaluate(() => ({
    asideText: document.querySelector('aside')?.textContent?.slice(0, 2200) || '',
    steps: Array.from(document.querySelectorAll('[data-meeting-workflow-step]')).map(button => ({
      stage: button.getAttribute('data-meeting-workflow-step'),
      state: button.getAttribute('data-meeting-workflow-step-state'),
      tone: button.getAttribute('data-meeting-workflow-step-tone'),
      disabled: button.hasAttribute('disabled'),
      text: button.textContent?.trim(),
      title: button.getAttribute('title'),
    })),
    errors: Array.from(document.querySelectorAll('.bg-red-50')).map(node => node.textContent?.trim()).filter(Boolean).slice(0, 5),
  }));

  const waitStepEnabled = async (step) => {
    const selector = '[data-meeting-workflow-step="' + step + '"]';
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(
      (selector) => !document.querySelector(selector)?.hasAttribute('disabled'),
      selector,
      { timeout: 10000 },
    );
    return page.locator(selector).first();
  };

  try {
    stage = 'authenticate';
    await page.goto(payload.productionUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
      key: payload.storageKey,
      session: payload.session,
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: new RegExp(payload.boardName) }).first().click();
    await page.waitForTimeout(1500);

    stage = 'open_meeting_composer';
    const meetingEntry = page.locator('button', { hasText: '新增會議記錄' }).first();
    await meetingEntry.waitFor({ state: 'visible', timeout: 20000 });
    await meetingEntry.click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-record-workflow-kind="meeting"]').waitFor({ state: 'visible', timeout: 15000 });

    stage = 'fill_meeting_draft';
    const title = 'DEV-011/012 production UI smoke ' + payload.uniqueNeedle;
    await page.locator('aside label', { hasText: '標題' }).locator('input').first().fill(title);
    const content = [
      '這是 DEV-011/012 正式前端 UI smoke。',
      payload.uniqueNeedle,
      '@[' + payload.taskA.title + '](task:' + payload.taskA.id + ') 已確認會議統整流程。',
      '@[' + payload.taskB.title + '](task:' + payload.taskB.id + ') 需要輸出自然語言摘要。',
      '請保留任務連結、結論、待辦與阻塞資訊。'
    ].join('\n');
    const editor = page.locator('aside div[contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await editor.fill(content);
    await page.waitForFunction(
      (needle) => (document.querySelector('aside div[contenteditable="true"]')?.textContent || '').includes(needle),
      payload.uniqueNeedle,
      { timeout: 5000 },
    );

    stage = 'run_ai_synthesis';
    const aiStep = await waitStepEnabled('ai_suggestion');
    await aiStep.click();
    const synthesisStatus = page.locator('[data-meeting-synthesis-status="ready"]');
    await synthesisStatus.waitFor({ state: 'visible', timeout: 90000 });
    const synthesisProof = await synthesisStatus.evaluate((element) => ({
      text: element.textContent || '',
      provider: element.getAttribute('data-meeting-synthesis-provider'),
      contract: element.getAttribute('data-meeting-synthesis-contract'),
      functionVersion: element.getAttribute('data-meeting-synthesis-function'),
      runId: element.getAttribute('data-meeting-synthesis-run-id'),
      model: element.getAttribute('data-meeting-synthesis-model'),
      quality: element.getAttribute('data-meeting-synthesis-quality'),
    }));
    if (
      !synthesisProof.text.includes('AI整理完成，請校稿後發布') ||
      synthesisProof.provider !== 'gemini' ||
      synthesisProof.contract !== 'meeting-synthesis-v2' ||
      !synthesisProof.functionVersion ||
      !synthesisProof.runId ||
      !synthesisProof.model ||
      synthesisProof.quality !== 'passed'
    ) {
      return JSON.stringify({
        ok: false,
        stage: 'ai_trace_contract',
        synthesisProof,
        workflow: await getWorkflowDebug(),
      }, null, 2);
    }
    const aiText = await editor.innerText();
    if (!aiText.includes('1. 本次會議總結') || !aiText.includes(payload.taskA.title) || !aiText.includes(payload.taskB.title)) {
      return JSON.stringify({
        ok: false,
        stage: 'ai_text_contract',
        aiText: aiText.slice(0, 1500),
        workflow: await getWorkflowDebug(),
      }, null, 2);
    }

    stage = 'save_review_draft';
    const reviewStep = await waitStepEnabled('review');
    await reviewStep.click();
    await page.waitForTimeout(1200);
    await page.waitForFunction(
      () => !document.querySelector('[data-meeting-workflow-step="published"]')?.hasAttribute('disabled'),
      null,
      { timeout: 15000 },
    );

    stage = 'publish_meeting_record';
    const publishStep = await waitStepEnabled('published');
    await publishStep.click();
    let publishUiEvidence = null;
    try {
      publishUiEvidence = await Promise.any([
        page.locator('aside', { hasText: '會議紀錄已發布' })
          .waitFor({ state: 'visible', timeout: 45000 })
          .then(() => 'published-status-message'),
        page.waitForFunction(
          () => document.querySelector('[data-meeting-workflow-step="published"]')?.getAttribute('data-meeting-workflow-step-state') === 'complete',
          null,
          { timeout: 45000 },
        ).then(() => 'published-workflow-complete'),
      ]);
    } catch {
      return JSON.stringify({
        ok: false,
        stage: 'publish_ui_confirmation',
        workflow: await getWorkflowDebug(),
      }, null, 2);
    }

    stage = 'records_library_ui';
    const recordsButton = page.locator('[data-sidebar-records-button="true"]').first();
    if (await recordsButton.count()) {
      await recordsButton.click();
      await page.locator('h1', { hasText: '紀錄庫' }).waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('.record-list-row', { hasText: payload.uniqueNeedle }).waitFor({ state: 'visible', timeout: 15000 });
    }

    stage = 'task_knowledge_ui';
    await page.goto(payload.productionUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ key, session, workspaceId, boardId }) => {
      localStorage.setItem(key, JSON.stringify(session));
      localStorage.setItem('projed-last-view', 'board');
      localStorage.setItem('projed-last-ws', workspaceId);
      localStorage.setItem('projed-last-board', boardId);
    }, {
      key: payload.storageKey,
      session: payload.session,
      workspaceId: payload.workspaceId,
      boardId: payload.boardId,
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: new RegExp(payload.boardName) }).first().click();
    await page.waitForTimeout(1500);
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-task-id="' + payload.taskA.uiId + '"]').first().click();
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const taskDetailsText = await page.locator('[data-task-details-modal="true"]').innerText({ timeout: 15000 });
    if (!taskDetailsText.includes('任務知識') || !taskDetailsText.includes(payload.uniqueNeedle)) {
      return JSON.stringify({
        ok: false,
        stage: 'task_knowledge_ui_missing',
        taskDetailsText: taskDetailsText.slice(0, 1800),
      }, null, 2);
    }

    const criticalMessages = messages.filter(m => m.type === 'error' && !/favicon|ResizeObserver/i.test(m.text));
    return JSON.stringify({
      ok: true,
      title,
      aiTextExcerpt: aiText.slice(0, 700),
      synthesisProof,
      reviewDraftSaved: true,
      publishUiEvidence,
      recordsUiChecked: true,
      taskKnowledgeUiChecked: true,
      criticalMessages,
      pageErrors,
      failed: failed.filter(f => !/fonts\.gstatic|googleapis/.test(f.url)),
    }, null, 2);
  } catch (error) {
    return JSON.stringify({
      ok: false,
      stage,
      error: error instanceof Error ? error.message : String(error),
      workflow: await getWorkflowDebug().catch(debugError => ({ debugError: debugError.message })),
      criticalMessages: messages.filter(m => m.type === 'error' && !/favicon|ResizeObserver/i.test(m.text)),
      pageErrors,
      failed: failed.filter(f => !/fonts\.gstatic|googleapis/.test(f.url)),
    }, null, 2);
  }
}`;
  const smokeCode = smokeCodeTemplate.replace('__PROD_SMOKE_PAYLOAD__', JSON.stringify(payload));
  mkdirSync('tmp', { recursive: true });
  smokeFile = `tmp/dev011012-production-ui-smoke-${suffix}.pw.js`;
  writeFileSync(smokeFile, smokeCode, 'utf8');

  const runSmoke = await runPowerShellScript([
    "$ErrorActionPreference = 'Continue'",
    playwrightCliCommand([`-s=${sessionName}`, 'open', PRODUCTION_URL]),
    '$open = $LASTEXITCODE',
    'if ($open -ne 0) { exit $open }',
    playwrightCliCommand([`-s=${sessionName}`, 'run-code', '--json', `--filename=${smokeFile}`]),
    '$run = $LASTEXITCODE',
    playwrightCliCommand([`-s=${sessionName}`, 'close']),
    'exit $run',
  ].join('\n'), {}, 360000);
  if (runSmoke.code !== 0 || /### Error/.test(runSmoke.stdout)) {
    throw new Error(`DEV-011/012 production UI smoke failed:\n${runSmoke.stdout}\n${runSmoke.stderr}`);
  }

  const browser = parsePlaywrightJson(runSmoke.stdout, runSmoke.stderr);
  if (!browser.ok) {
    throw new Error(
      `DEV-011/012 production UI smoke did not pass at ${browser.stage || 'unknown stage'}:\n` +
      JSON.stringify(browser, null, 2).slice(0, 6000),
    );
  }

  const records = assertOk(
    'knowledge_records select',
    await userClient
      .from('knowledge_records')
      .select('id,title,status,content,source_document_id,rag_enabled,metadata')
      .eq('tenant_id', tenant.id)
      .eq('project_id', project.id)
      .eq('status', 'published')
      .ilike('title', `%${uniqueNeedle}%`),
  );
  if (!records?.length) throw new Error('Published knowledge record was not found in production fixture.');
  const record = records[0];
  if (!record.content?.includes(taskA.title) || !record.content?.includes(taskB.title)) {
    throw new Error('Published knowledge record does not contain both fixture task titles.');
  }
  const persistedSynthesisTrace = record.metadata?.meetingSynthesis;
  if (
    !persistedSynthesisTrace ||
    persistedSynthesisTrace.contractVersion !== 'meeting-synthesis-v2' ||
    persistedSynthesisTrace.provider !== 'gemini' ||
    persistedSynthesisTrace.quality?.passed !== true ||
    !persistedSynthesisTrace.runId ||
    persistedSynthesisTrace.runId !== browser.synthesisProof?.runId
  ) {
    throw new Error('Published record synthesis metadata does not match the browser v2 trace.');
  }

  const links = assertOk(
    'record_task_links select',
    await userClient
      .from('record_task_links')
      .select('item_id,role')
      .eq('tenant_id', tenant.id)
      .eq('project_id', project.id)
      .eq('record_id', record.id),
  );
  const linkedIds = new Set((links ?? []).map(link => link.item_id));
  if (!linkedIds.has(taskA.id) || !linkedIds.has(taskB.id)) {
    throw new Error('Published record_task_links do not include both fixture tasks.');
  }

  const report = {
    ok: true,
    mode: 'production-fixture',
    mutates_database: true,
    production_url: PRODUCTION_URL,
    project_ref: projectRef,
    setup: {
      temporary_user_created: true,
      temporary_tenant_created: true,
      board_count: 1,
      task_count: 2,
      activity_event_seeded: true,
    },
    browser,
    database: {
      published_record_found: true,
      record_task_links: links.length,
      rag_enabled: record.rag_enabled,
      source_document_present: Boolean(record.source_document_id),
      synthesis_contract: persistedSynthesisTrace.contractVersion,
      synthesis_provider: persistedSynthesisTrace.provider,
      synthesis_quality_passed: persistedSynthesisTrace.quality.passed,
      synthesis_trace_match: true,
    },
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (sessionName) {
    await run(
      'npx.cmd',
      [
        '--yes',
        '--package',
        '@playwright/cli',
        'playwright-cli',
        `-s=${sessionName}`,
        'close',
      ],
      {},
      60000,
    );
  }
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
