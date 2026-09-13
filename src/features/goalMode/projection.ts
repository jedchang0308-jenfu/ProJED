export type GoalProjectionInputRow = Readonly<{
  taskId: string;
  level: number;
  description?: string | null;
  meeting?: string | null;
}>;

export type GoalOwnedCell<T> = Readonly<{
  kind: 'owner';
  value: T;
  rowSpan: number;
}> | Readonly<{
  kind: 'covered';
}> | Readonly<{
  kind: 'empty';
}>;

export type GoalProjectionRow = GoalProjectionInputRow & Readonly<{
  descriptionCell: GoalOwnedCell<string>;
  meetingCell: GoalOwnedCell<string>;
}>;

export type GoalSparseProjection = Readonly<{
  rows: readonly GoalProjectionRow[];
  hasDescriptionColumn: boolean;
  hasMeetingColumn: boolean;
}>;

const normalizeDescription = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const projectColumn = (
  rows: readonly GoalProjectionInputRow[],
  valueOf: (row: GoalProjectionInputRow) => string | null,
): GoalOwnedCell<string>[] => {
  const result: GoalOwnedCell<string>[] = rows.map(() => ({ kind: 'empty' }));
  for (let index = 0; index < rows.length; index += 1) {
    const value = valueOf(rows[index]);
    if (!value || result[index].kind !== 'empty') continue;
    let end = index + 1;
    while (end < rows.length && rows[end].level > rows[index].level && !valueOf(rows[end])) end += 1;
    const rowSpan = end - index;
    result[index] = { kind: 'owner', value, rowSpan };
    for (let coveredIndex = index + 1; coveredIndex < end; coveredIndex += 1) {
      result[coveredIndex] = { kind: 'covered' };
    }
  }
  return result;
};

/**
 * Build independent sparse cells for optional task description and meeting
 * note columns. A parent owns a contiguous descendant span only when those
 * descendant rows are blank in the same column; no value is inherited.
 */
export const buildGoalSparseProjection = (
  inputRows: readonly GoalProjectionInputRow[],
): GoalSparseProjection => {
  const rows = inputRows.map(row => ({
    ...row,
    description: normalizeDescription(row.description),
    meeting: normalizeDescription(row.meeting),
  }));
  const descriptionCells = projectColumn(rows, row => normalizeDescription(row.description));
  const meetingCells = projectColumn(rows, row => normalizeDescription(row.meeting));
  return {
    rows: rows.map((row, index) => ({
      ...row,
      descriptionCell: descriptionCells[index],
      meetingCell: meetingCells[index],
    })),
    hasDescriptionColumn: descriptionCells.some(cell => cell.kind === 'owner'),
    hasMeetingColumn: meetingCells.some(cell => cell.kind === 'owner'),
  };
};
