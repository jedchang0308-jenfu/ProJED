import assert from 'node:assert/strict';
import test from 'node:test';

import { readMeetingReviewSummary } from '../../../src/features/meetingTaskResolution/meetingAnalysisContract.js';

test('legacy review without summary maps to null and valid summary text is preserved', () => {
  assert.equal(readMeetingReviewSummary({ captureId: 'capture-a', segments: [] }), null);
  assert.equal(readMeetingReviewSummary({ summary: null }), null);
  assert.equal(readMeetingReviewSummary({ summary: '' }), '');
  assert.equal(readMeetingReviewSummary({ summary: '  原文摘要 😀  ' }), '  原文摘要 😀  ');
});

test('malformed review summaries are rejected rather than converted to empty text', () => {
  for (const summary of [undefined, false, 0, {}, []]) {
    assert.throws(() => readMeetingReviewSummary({ summary }), /Invalid meeting review summary/u);
  }
  assert.throws(() => readMeetingReviewSummary(null), /Invalid meeting review response/u);
});
