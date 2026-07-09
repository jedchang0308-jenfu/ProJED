import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const PRODUCTION_URL = 'https://projed-cc78d.web.app/';
const ALLOW_ENV = 'DEV024_ALLOW_PRODUCTION_FIXTURE';
const RUN_FLAG = '--run-production-fixture';

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

const includesAll = (source, tokens) => tokens.every(token => source.includes(token));

const assertOk = (label, result) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

const countOccurrences = (text, needle) => {
  if (!needle) return 0;
  return text.split(needle).length - 1;
};

const runSelfCheck = () => {
  const packageJson = readFileSync('package.json', 'utf8');
  const source = readFileSync('scripts/verify-dev-024-production-ui-smoke.mjs', 'utf8');
  const spec = readFileSync('ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md', 'utf8');
  const qa = readFileSync('ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md', 'utf8');
  const qc = readFileSync('ai-doc/qc/QC-DEV-024-ai-synthesis-preserve-human-draft.md', 'utf8');
  const devTask = readFileSync('ai-doc/dev_task.md', 'utf8');
  const documentationMap = readFileSync('ai-doc/documentation_map.md', 'utf8');

  const checks = [];
  const add = (name, pass, details = undefined) => checks.push({ name, pass, ...(details === undefined ? {} : { details }) });

  add(
    'package exposes guarded DEV-024 production UI smoke',
    packageJson.includes('"verify:dev-024-production-ui-smoke": "node scripts/verify-dev-024-production-ui-smoke.mjs"'),
  );
  add(
    'executor requires explicit production fixture opt-in and flag',
    includesAll(source, [
      'DEV024_ALLOW_PRODUCTION_FIXTURE',
      '--run-production-fixture',
      'Refusing production fixture smoke',
      'admin.auth.admin.createUser',
      'admin.auth.admin.deleteUser',
      ".from('tenants').delete()",
    ]),
  );
  add(
    'executor covers DEV-024 production UI risks and DB proof',
    includesAll(source, [
      'project_import',
      'ai_suggestion',
      'published',
      'handwrittenPlain',
      'customSectionBody',
      'taskMentionSentence',
      'humanSupplement',
      'record_task_links',
      'published_record_found',
    ]),
  );
  add(
    'docs record DEV-024 production smoke pass with fixture evidence',
    [spec, qa, qc, devTask, documentationMap].every(doc => includesAll(doc, [
      'Production UI Smoke Passed',
      'verify:dev-024-production-ui-smoke',
      'DEV024_ALLOW_PRODUCTION_FIXTURE=1',
      'published_record_found=true',
      'tenantDeleted=true',
      'userDeleted=true',
    ])),
  );

  const failures = checks.filter(check => !check.pass);
  console.log(JSON.stringify({
    ok: failures.length === 0,
    mode: 'self-check',
    mutates_database: false,
    production_fixture_allowed: false,
    run_condition: `${RUN_FLAG} and ${ALLOW_ENV}=1`,
    checks,
  }, null, 2));
  if (failures.length > 0) process.exit(1);
};

if (!process.argv.includes(RUN_FLAG)) {
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
const email = `dev024-prod-ui-${suffix}@example.invalid`;
const password = `Dev024-${suffix}-Aa1!`;

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
      user_metadata: { name: 'DEV-024 Production UI Smoke' },
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
      .upsert({ id: userId, email, display_name: 'DEV-024 Production UI Smoke' })
      .select()
      .single(),
  );

  const tenant = assertOk(
    'create_tenant_with_owner',
    await userClient.rpc('create_tenant_with_owner', {
      tenant_name: `DEV-024 Production UI Smoke ${suffix}`,
    }),
  );
  cleanup.tenantId = tenant.id;

  const project = assertOk(
    'project insert',
    await userClient
      .from('projects')
      .insert({
        tenant_id: tenant.id,
        legacy_board_id: `dev024-prod-board-${suffix}`,
        name: 'DEV-024 正式手寫保留看板',
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
        legacy_node_id: `dev024-prod-root-${suffix}`,
        title: 'DEV-024 正式煙測清單',
        status: 'todo',
        item_type: 'group',
        sort_order: 1,
      })
      .select()
      .single(),
  );

  const importTask = assertOk(
    'import task insert',
    await userClient
      .from('wbs_items')
      .insert({
        tenant_id: tenant.id,
        project_id: project.id,
        parent_id: root.id,
        legacy_node_id: `dev024-prod-task-import-${suffix}`,
        title: 'DEV-024 匯入任務正式煙測',
        status: 'in_progress',
        item_type: 'task',
        sort_order: 1,
      })
      .select()
      .single(),
  );

  const humanTask = assertOk(
    'human task insert',
    await userClient
      .from('wbs_items')
      .insert({
        tenant_id: tenant.id,
        project_id: project.id,
        parent_id: root.id,
        legacy_node_id: `dev024-prod-task-human-${suffix}`,
        title: 'DEV-024 手寫保留任務正式煙測',
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
        entity_id: importTask.id,
        payload: {
          taskId: importTask.id,
          taskTitle: importTask.title,
          before: { status: 'todo' },
          after: { status: 'in_progress' },
          summary: '待辦 -> 進行中',
        },
      })
      .select()
      .single(),
  );

  const uniqueNeedle = `DEV-024-PROD-SMOKE-${suffix}`;
  const expected = {
    handwrittenPlain: `客戶要求 6/20 前確認報價風險 ${uniqueNeedle}`,
    customSectionBody: `本案背景是客戶要先確認量產條件 ${uniqueNeedle}`,
    taskMentionSentence: `@[${humanTask.title}](task:${humanTask.id}) 需要 Jane 在下週一前補齊風險清單 ${uniqueNeedle}`,
    humanSupplement: `使用者補充：供應商需要週五前確認交期 ${uniqueNeedle}`,
  };
  const payload = {
    storageKey,
    session: signIn.session,
    workspaceId: tenant.id,
    boardId: project.legacy_board_id || project.id,
    boardName: project.name,
    importTask: { id: importTask.id, uiId: importTask.legacy_node_id || importTask.id, title: importTask.title },
    humanTask: { id: humanTask.id, uiId: humanTask.legacy_node_id || humanTask.id, title: humanTask.title },
    uniqueNeedle,
    expected,
    productionUrl: PRODUCTION_URL,
  };

  sessionName = `prod-dev024-${suffix}`;
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

  const countOccurrences = (text, needle) => needle ? text.split(needle).length - 1 : 0;
  const getEditor = () => page.locator('aside div[contenteditable="true"]').first();
  const getWorkflowDebug = async () => page.evaluate(() => ({
    asideText: document.querySelector('aside')?.textContent?.slice(0, 2600) || '',
    editorText: document.querySelector('aside div[contenteditable="true"]')?.textContent?.slice(0, 2600) || '',
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
      { timeout: 15000 },
    );
    return page.locator(selector).first();
  };

  const appendEditorContent = async (content) => {
    const editor = getEditor();
    const expectedLine = content.split('\n').map(line => line.trim()).filter(Boolean).at(-1) || content.trim();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText('\n' + content);
    try {
      await page.waitForFunction(
        (expected) => (document.querySelector('aside div[contenteditable="true"]')?.textContent || '').includes(expected),
        expectedLine,
        { timeout: 2500 },
      );
    } catch {
      const currentText = await editor.innerText();
      await editor.fill(currentText.trimEnd() + '\n' + content);
      await page.waitForFunction(
        (expected) => (document.querySelector('aside div[contenteditable="true"]')?.textContent || '').includes(expected),
        expectedLine,
        { timeout: 5000 },
      );
    }
  };

  const runAiSynthesis = async () => {
    const aiStep = await waitStepEnabled('ai_suggestion');
    await aiStep.click();
    await page.locator('aside', { hasText: 'AI整理完成，請校稿後發布' }).waitFor({ state: 'visible', timeout: 90000 });
    return getEditor().innerText();
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

    stage = 'fill_initial_draft';
    const title = 'DEV-024 production UI smoke ' + payload.uniqueNeedle;
    await page.locator('aside label', { hasText: '標題' }).locator('input').first().fill(title);
    const editor = getEditor();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await editor.fill('會前先整理本週專案變更。');

    stage = 'project_change_import';
    await page.locator('[data-meeting-workflow-step="project_import"]').first().click();
    const panel = page.locator('[data-project-change-import-panel]');
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    await panel.locator('button', { hasText: '整理專案變化' }).click();
    await panel.locator('button', { hasText: '插入紀錄並開始撰寫' }).waitFor({ state: 'visible', timeout: 120000 });
    const previewText = await panel.innerText();
    if (!previewText.includes(payload.importTask.title)) {
      return JSON.stringify({ ok: false, stage: 'project_import_preview_missing_task', previewText: previewText.slice(0, 1800) }, null, 2);
    }
    await panel.locator('button', { hasText: '插入紀錄並開始撰寫' }).click();
    await panel.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);

    stage = 'append_human_draft';
    const humanDraft = [
      '## 會議背景',
      payload.expected.customSectionBody,
      payload.expected.handwrittenPlain,
      payload.expected.taskMentionSentence,
      payload.expected.humanSupplement,
    ].join('\n');
    await appendEditorContent(humanDraft);

    stage = 'first_ai_synthesis';
    const firstAiText = await runAiSynthesis();
    const requiredTokens = [
      payload.expected.customSectionBody,
      payload.expected.handwrittenPlain,
      payload.humanTask.title,
      payload.expected.humanSupplement,
      payload.importTask.title,
    ];
    const missingAfterFirst = requiredTokens.filter(token => !firstAiText.includes(token));
    if (missingAfterFirst.length > 0) {
      return JSON.stringify({
        ok: false,
        stage: 'first_ai_missing_preserved_content',
        missingAfterFirst,
        firstAiText: firstAiText.slice(0, 2600),
        workflow: await getWorkflowDebug(),
      }, null, 2);
    }

    stage = 'second_ai_synthesis_idempotent';
    const secondAiText = await runAiSynthesis();
    const missingAfterSecond = requiredTokens.filter(token => !secondAiText.includes(token));
    if (missingAfterSecond.length > 0 || countOccurrences(secondAiText, payload.expected.humanSupplement) !== 1) {
      return JSON.stringify({
        ok: false,
        stage: 'second_ai_idempotency_or_preserve_failure',
        missingAfterSecond,
        humanSupplementCount: countOccurrences(secondAiText, payload.expected.humanSupplement),
        secondAiText: secondAiText.slice(0, 3000),
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

    const criticalMessages = messages.filter(m => m.type === 'error' && !/favicon|ResizeObserver/i.test(m.text));
    return JSON.stringify({
      ok: true,
      title,
      firstAiExcerpt: firstAiText.slice(0, 900),
      secondAiExcerpt: secondAiText.slice(0, 900),
      projectImportUiChecked: true,
      preserveChecks: {
        handwrittenPlain: secondAiText.includes(payload.expected.handwrittenPlain),
        customSectionBody: secondAiText.includes(payload.expected.customSectionBody),
        taskMentionTitle: secondAiText.includes(payload.humanTask.title),
        humanSupplement: secondAiText.includes(payload.expected.humanSupplement),
        projectChangeTask: secondAiText.includes(payload.importTask.title),
        humanSupplementCount: countOccurrences(secondAiText, payload.expected.humanSupplement),
      },
      reviewDraftSaved: true,
      publishUiEvidence,
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
  smokeFile = `tmp/dev024-production-ui-smoke-${suffix}.pw.js`;
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
  ].join('\n'), {}, 480000);
  if (runSmoke.code !== 0 || /### Error/.test(runSmoke.stdout)) {
    throw new Error(`DEV-024 production UI smoke failed:\n${runSmoke.stdout}\n${runSmoke.stderr}`);
  }

  const browser = parsePlaywrightJson(runSmoke.stdout, runSmoke.stderr);
  if (!browser.ok) {
    throw new Error(
      `DEV-024 production UI smoke did not pass at ${browser.stage || 'unknown stage'}:\n` +
      JSON.stringify(browser, null, 2).slice(0, 7000),
    );
  }

  const records = assertOk(
    'knowledge_records select',
    await userClient
      .from('knowledge_records')
      .select('id,title,status,content,source_document_id,rag_enabled')
      .eq('tenant_id', tenant.id)
      .eq('project_id', project.id)
      .eq('status', 'published')
      .ilike('title', `%${uniqueNeedle}%`),
  );
  if (!records?.length) throw new Error('Published DEV-024 knowledge record was not found in production fixture.');
  const record = records[0];
  const content = record.content ?? '';
  const expectedTokens = [
    expected.handwrittenPlain,
    expected.customSectionBody,
    humanTask.title,
    expected.humanSupplement,
    importTask.title,
  ];
  const missingRecordTokens = expectedTokens.filter(token => !content.includes(token));
  if (missingRecordTokens.length > 0) {
    throw new Error(`Published record lost DEV-024 preserved content: ${JSON.stringify(missingRecordTokens)}\n${content.slice(0, 3000)}`);
  }
  if (countOccurrences(content, expected.humanSupplement) !== 1) {
    throw new Error(`Published record duplicated human supplement ${countOccurrences(content, expected.humanSupplement)} times.`);
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
  if (!linkedIds.has(humanTask.id)) {
    throw new Error(`Published DEV-024 record_task_links do not include the handwritten task mention. Links: ${JSON.stringify(links)}`);
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
      import_task_linked: linkedIds.has(importTask.id),
      human_task_linked: linkedIds.has(humanTask.id),
      rag_enabled: record.rag_enabled,
      source_document_present: Boolean(record.source_document_id),
      preserved_content: {
        handwritten_plain: content.includes(expected.handwrittenPlain),
        custom_section_body: content.includes(expected.customSectionBody),
        task_mention_title: content.includes(humanTask.title),
        project_change_task: content.includes(importTask.title),
        human_supplement: content.includes(expected.humanSupplement),
        human_supplement_count: countOccurrences(content, expected.humanSupplement),
      },
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
