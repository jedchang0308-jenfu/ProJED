import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const defaultOutputPath = 'output/qa/dev-123/provider-contract-result.json';
const expectedModels = {
  transcribe: 'gemini-3.5-transcribe',
  embedding: 'gemini-embedding-001',
  compose: 'gemini-3.5-flash',
};

const env = (name: string) => String(process.env[name] ?? '').trim();
const boolEnv = (name: string) => env(name).toLowerCase() === 'true';

const run = () => {
  const worker = readFileSync('supabase/functions/process_meeting_analysis/index.ts', 'utf8');
  const control = readFileSync('supabase/functions/meeting_capture_control/index.ts', 'utf8');
  const spec = readFileSync('ai-doc/specs/SPEC-123-meeting-task-resolution-audio-pointer.md', 'utf8');
  const mode = env('DEV123_PROVIDER_MODE') || 'fake';

  assert.match(worker, /PROVIDER_QUALIFICATION_REQUIRED/);
  assert.match(worker, /provider_qualification_required/);
  assert.match(control, /p_provider_mode: Deno\.env\.get\("DEV123_PROVIDER_MODE"\) \?\? "fake"/);
  assert.match(spec, /供應商不得保留可回取的會議內容/);
  assert.match(spec, /Interactions 一律 `store=false`/);
  assert.match(spec, /Files.*主動刪除/);

  const required = {
    apiKey: Boolean(env('GEMINI_MEETING_ZDR_API_KEY')),
    projectId: Boolean(env('GEMINI_MEETING_PROJECT_ID')),
    zdrConfirmed: boolEnv('DEV123_PROVIDER_ZDR_CONFIRMED'),
    configFingerprint: Boolean(env('DEV123_PROVIDER_CONFIG_FINGERPRINT')),
    filesDeleteVerified: boolEnv('DEV123_PROVIDER_FILES_DELETE_VERIFIED'),
    storeFalse: env('DEV123_PROVIDER_STORE').toLowerCase() === 'false',
    backgroundFalse: env('DEV123_PROVIDER_BACKGROUND').toLowerCase() === 'false',
    transcribeModel: (env('GEMINI_MEETING_TRANSCRIBE_MODEL') || expectedModels.transcribe) === expectedModels.transcribe,
    embeddingModel: (env('GEMINI_MEETING_EMBEDDING_MODEL') || expectedModels.embedding) === expectedModels.embedding,
    composeModel: (env('GEMINI_MEETING_COMPOSE_MODEL') || expectedModels.compose) === expectedModels.compose,
  };

  const result = {
    devId: 'DEV-123',
    status: mode === 'fake' ? 'PENDING' : Object.values(required).every(Boolean) ? 'CONFIG_READY_NOT_QUALIFIED' : 'FAIL_CLOSED',
    mode,
    dispatchPerformed: false,
    networkCallPerformed: false,
    required,
    expectedModels,
    reason: mode === 'fake'
      ? 'local fake mode; no provider content dispatch was attempted'
      : Object.values(required).every(Boolean)
        ? 'configuration is present; WP-123-0b synthetic provider evidence is still required'
        : 'gemini mode requires complete ZDR/config/cleanup evidence before dispatch',
    generatedAt: new Date().toISOString(),
  };

  const outputPath = env('DEV123_PROVIDER_OUTPUT_PATH') || defaultOutputPath;
  mkdirSync('output/qa/dev-123', { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  if (mode !== 'fake' && result.status === 'FAIL_CLOSED') process.exitCode = 2;
};

run();
