import assert from 'node:assert/strict';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import {
  buildMeetingSynthesisPrompt,
  completeMeetingSynthesis,
  MeetingSynthesisQualityError,
  parseMeetingSynthesisRequest,
} from '../../../server/meetingSynthesis.js';

const CONTRACT = 'meeting-synthesis-v2';

function validBody(): Record<string, unknown> {
  return {
    title: 'Iteration review',
    participantsText: 'Team A',
    rawContent: '已確認子任務交付內容，並由團隊依照驗收項目安排下一步。 @[Child](task:child)',
    taskLinks: [{ nodeId: 'child', role: 'related' }],
    tasks: [
      { id: 'parent', title: 'Parent', path: [] },
      { id: 'child', title: 'Child', path: [{ id: 'parent', title: 'Parent' }, { id: 'child', title: 'Child' }] },
    ],
    activities: [],
    occurredAt: 1_777_000_000_000,
    requiredContractVersion: CONTRACT,
  };
}

function generatedContent(heading = '@[Child](task:child)'): string {
  return [
    '1. 本次會議總結',
    '- 已確認交付內容與驗收安排，後續由團隊依既定流程完成。',
    '',
    '2. 任務討論與結論',
    `2.1 ${heading}`,
    '確認子任務的交付方式，並保留後續驗證所需的工作內容。',
  ].join('\n');
}

function metadata() {
  return { runId: 'meeting-run-1', model: 'gemini-3.5-flash' };
}

test('request parser rejects unknown keys, malformed shapes, and unsupported contract versions', () => {
  assert.throws(
    () => parseMeetingSynthesisRequest({ ...validBody(), ownerId: 'untrusted' }),
    (error: unknown) => error instanceof KernelError && error.code === 'DOMAIN_DATA_INVALID',
  );
  assert.throws(
    () => parseMeetingSynthesisRequest({ ...validBody(), tasks: 'not-an-array' }),
    (error: unknown) => error instanceof KernelError && error.code === 'DOMAIN_DATA_INVALID',
  );
  assert.throws(
    () => parseMeetingSynthesisRequest({ ...validBody(), requiredContractVersion: 'meeting-synthesis-v1' }),
    (error: unknown) => error instanceof KernelError && error.code === 'CONTRACT_VERSION_MISMATCH',
  );
  assert.throws(
    () => parseMeetingSynthesisRequest({ ...validBody(), occurredAt: Number.POSITIVE_INFINITY }),
    (error: unknown) => error instanceof KernelError && error.code === 'DOMAIN_DATA_INVALID',
  );
});

test('request normalization keeps the legacy caps and reports filtered, duplicate, and tail activity counts', () => {
  const body = validBody();
  body.title = 'T'.repeat(200);
  body.participantsText = 'P'.repeat(600);
  body.rawContent = 'R'.repeat(13_000);
  body.taskLinks = Array.from({ length: 85 }, (_, index) => ({ nodeId: `link-${index}`, role: 'related' }));
  body.tasks = Array.from({ length: 82 }, (_, index) => ({
    id: `task-${index}`,
    title: 'X'.repeat(200),
    path: Array.from({ length: 80 }, (_unused, pathIndex) => ({ id: `path-${pathIndex}`, title: 'Y'.repeat(200) })),
  }));
  body.activities = [
    ...Array.from({ length: 205 }, (_, index) => ({
      eventType: 'task_note', nodeId: 'task-1', title: 'Task', occurredAt: index,
      summary: `內容摘要項目 ${index} 已確認`, payload: {},
    })),
    { eventType: 'task_moved', nodeId: 'task-1', title: 'Task', occurredAt: 206, summary: '任務已移動。', payload: {} },
    { eventType: 'task_note', nodeId: 'task-1', title: 'Task', occurredAt: 0, summary: '內容摘要項目 0 已確認', payload: {} },
  ];

  const parsed = parseMeetingSynthesisRequest(body);
  assert.equal(parsed.input.title.length, 160);
  assert.equal(parsed.input.participantsText?.length, 500);
  assert.equal(parsed.input.rawContent.length, 12_000);
  assert.equal(parsed.input.taskLinks.length, 80);
  assert.equal(parsed.input.tasks.length, 80);
  assert.equal(parsed.input.tasks[0]?.title.length, 160);
  assert.equal(parsed.input.tasks[0]?.path?.length, 80);
  assert.equal(parsed.input.tasks[0]?.path?.[0]?.title.length, 160);
  assert.equal(parsed.input.activities.length, 200);
  assert.equal(parsed.input.activities[0]?.summary, '內容摘要項目 5 已確認');
  assert.deepEqual(parsed.normalization, {
    receivedActivityCount: 207,
    acceptedActivityCount: 200,
    droppedActivityCount: 7,
  });
});

test('prompt carries the full task-grounding and human-content rules with normalized source package', () => {
  const parsed = parseMeetingSynthesisRequest(validBody());
  const prompt = buildMeetingSynthesisPrompt(parsed.input);
  assert.match(prompt, /只有 rawContent 或 activities 直接指向的任務才建立正文段落/u);
  assert.match(prompt, /任務完整路徑必須整合在同一個標題行/u);
  assert.match(prompt, /不要補寫人類沒講過、沒做過的事/u);
  assert.match(prompt, /"requiredContractVersion": "meeting-synthesis-v2"/u);
  assert.match(prompt, /Source package:/u);
});

test('completion repairs a missing parent path and returns a quality-passed Google response', () => {
  const source = parseMeetingSynthesisRequest(validBody());
  const response = completeMeetingSynthesis(source, `\`\`\`json\n${JSON.stringify({
    content: generatedContent(), warnings: ['已依原文整理。'], linkedTaskIds: ['untrusted-model-id'],
  })}\n\`\`\``, metadata());

  assert.equal(response.content, generatedContent('@[Parent](task:parent)／@[Child](task:child)'));
  assert.deepEqual(response.linkedTaskIds, ['parent', 'child']);
  assert.equal(response.provider, 'google');
  assert.equal(response.model, 'gemini-3.5-flash');
  assert.equal(response.functionVersion, 'projed-http-meeting-synthesis-v1');
  assert.equal(response.runId, 'meeting-run-1');
  assert.deepEqual(response.warnings, ['已依原文整理。']);
  assert.deepEqual(response.normalization, source.normalization);
  assert.equal(response.quality.passed, true);
});

test('separate source paths stay separate evidence after normalization', () => {
  const body=validBody();
  body.rawContent='@[Parent](task:parent)／@[Child](task:child)\r\n確認子任務交付內容。\r\n@[Parent](task:parent)／@[Other](task:other)\r\n確認另一任務驗收方式。';
  body.tasks=[...(body.tasks as object[]),{id:'other',title:'Other',path:[{id:'parent',title:'Parent'},{id:'other',title:'Other'}]}];
  const source=parseMeetingSynthesisRequest(body);
  assert.ok(source.input.rawContent.includes('\n'));
  const content=generatedContent('@[Parent](task:parent)／@[Child](task:child)')
    +'\n\n2.2 @[Parent](task:parent)／@[Other](task:other)\n確認另一任務的驗收方式，並保留討論內容。';
  const result=completeMeetingSynthesis(source,JSON.stringify({content}),metadata());
  assert.equal(result.quality.passed,true);
  assert.ok(result.linkedTaskIds.includes('child')&&result.linkedTaskIds.includes('other'));
});

test('completion rejects unknown task IDs with the stable quality error details', () => {
  const source = parseMeetingSynthesisRequest(validBody());
  assert.throws(
    () => completeMeetingSynthesis(source, JSON.stringify({
      content: generatedContent('@[Unknown](task:unknown)'),
    }), metadata()),
    (error: unknown) => error instanceof MeetingSynthesisQualityError
      && error.code === 'QUALITY_GATE_FAILED'
      && error.details.runId === 'meeting-run-1'
      && error.details.functionVersion === 'projed-http-meeting-synthesis-v1'
      && error.details.violations.includes('UNKNOWN_TASK_ID')
      && error.details.affectedTaskIds.includes('unknown'),
  );
});

test('completion fails closed on malformed, empty, and incomplete provider output', () => {
  const source = parseMeetingSynthesisRequest(validBody());
  assert.throws(
    () => completeMeetingSynthesis(source, 'not JSON', metadata()),
    (error: unknown) => error instanceof KernelError && error.code === 'SYNTHESIS_INVALID_RESPONSE',
  );
  assert.throws(
    () => completeMeetingSynthesis(source, JSON.stringify({ content: '   ' }), metadata()),
    (error: unknown) => error instanceof KernelError && error.code === 'EMPTY_SYNTHESIS',
  );
  assert.throws(
    () => completeMeetingSynthesis(source, JSON.stringify({ content: '只有沒有編號的摘要文字。' }), metadata()),
    (error: unknown) => error instanceof MeetingSynthesisQualityError
      && error.details.violations.includes('MISSING_SUMMARY_SECTION'),
  );
});
