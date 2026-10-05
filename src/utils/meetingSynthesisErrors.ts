export type MeetingSynthesisFailureDetails = {
  runId?: string;
  functionVersion?: string;
  violations: string[];
  affectedTaskIds: string[];
};

export const readMeetingSynthesisFailureDetails = (value: unknown): MeetingSynthesisFailureDetails | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const strings = (input: unknown) => Array.isArray(input)
    ? [...new Set(input.filter((item): item is string => typeof item === 'string' && item.length > 0))].slice(0, 80)
    : [];
  return {
    runId: typeof record.runId === 'string' ? record.runId : undefined,
    functionVersion: typeof record.functionVersion === 'string' ? record.functionVersion : undefined,
    violations: strings(record.violations),
    affectedTaskIds: strings(record.affectedTaskIds),
  };
};

export const getMeetingSynthesisFailureMessage = (
  code: string, fallback: string, details?: MeetingSynthesisFailureDetails,
) => {
  if (code !== 'QUALITY_GATE_FAILED') return fallback;
  if (details?.violations.includes('INCOMPLETE_TASK_PATH')) {
    return '部分任務的階層標籤不完整，原草稿已保留。';
  }
  if (details?.violations.some(item => ['UNKNOWN_TASK_ID', 'AMBIGUOUS_TASK_HEADING', 'INVALID_SOURCE_TASK_PATH'].includes(item))) {
    return '部分段落無法確認對應任務，原草稿已保留。';
  }
  return 'AI 整理結果未通過內容品質檢查，原草稿已保留。';
};
