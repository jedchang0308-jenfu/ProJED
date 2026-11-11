import assert from 'node:assert/strict';
import test from 'node:test';

import {buildWbsRagSource,type WbsRagSourceInput} from '../../../shared/wbsRagSource.js';
import {taskNoteToAiMarkdown} from '../../../src/utils/taskNoteRichContent.js';
import {createPlainTaskNoteRichContent} from '../../../src/utils/taskNoteRichContent.js';

function base(overrides:Partial<WbsRagSourceInput>={}):WbsRagSourceInput{
  return {title:'防水測試',nodeType:'milestone',status:'onhold',startDate:'2026-10-29',endDate:'2026-11-01',
    detailNotes:[{id:'n1',title:' 重點 ',content:'確認回報'}],...overrides};
}

test('preserves the canonical legacy WBS RAG content and historical FNV hash',()=>{
  const node=base({description:'先不要做'});
  const tags=['Beta','Alpha'] as const;
  const result=buildWbsRagSource(node,tags);
  assert.equal(result.content,'標題：防水測試\n\n類型：milestone\n\n狀態：onhold\n\n標籤：Beta, Alpha\n\n排程：2026-10-29 至 2026-11-01\n\n## 備註：重點\n\n備註 ID：n1\n\n確認回報');
  assert.equal(result.contentHash,'fnv1a32:6c89f491');
});

test('uses trimmed description only when notes contribute no content',()=>{
  const emptyNotes=buildWbsRagSource(base({detailNotes:[],description:'  先不要變更資料  '}));
  assert.ok(emptyNotes.content.includes('描述：\n先不要變更資料'));
  assert.ok(!emptyNotes.content.includes('## 備註：'));

  const titledNote=buildWbsRagSource(base({detailNotes:[{id:'n2',title:'確認',content:''}],description:'不應重複'}));
  assert.ok(titledNote.content.includes('## 備註：確認\n\n備註 ID：n2'));
  assert.ok(!titledNote.content.includes('描述：'));
});

test('uses the existing rich-note Markdown projection without losing negation',()=>{
  const note={id:'n3',title:'操作限制',content:'舊純文字備援',
    richContent:createPlainTaskNoteRichContent('不要刪除既有連結')};
  const expected=taskNoteToAiMarkdown(note);
  const result=buildWbsRagSource(base({detailNotes:[note]}));
  assert.ok(expected.includes('不要刪除既有連結'));
  assert.ok(result.content.includes(`## 備註：操作限制\n\n備註 ID：n3\n\n${expected}`));
});

test('retains input and tag order while building the source',()=>{
  const node=base({detailNotes:[]});
  const before=structuredClone(node);
  const tags=['Beta','Alpha'] as const;
  const tagCopy=[...tags];
  const source=buildWbsRagSource(node,tags);
  const reversed=buildWbsRagSource(node,[...tags].reverse());
  assert.ok(source.content.includes('標籤：Beta, Alpha'));
  assert.ok(reversed.content.includes('標籤：Alpha, Beta'));
  assert.notEqual(source.contentHash,reversed.contentHash);
  assert.deepEqual(node,before);
  assert.deepEqual(tags,tagCopy);
});
