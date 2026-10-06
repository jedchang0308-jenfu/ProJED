type TaskPathItem = { id: string; title: string };
type SynthesisTask = TaskPathItem & { path?: TaskPathItem[] };

const taskTags = (content: string) =>
  Array.from(content.matchAll(/@\[([^\]]+)\]\(task:([^)]+)\)/g), match => match[2]);

const taskPath = (task: SynthesisTask) => {
  const path = task.path?.length ? [...task.path] : [{ id: task.id, title: task.title }];
  if (!path.some(item => item.id === task.id)) path.push({ id: task.id, title: task.title });
  return path;
};

const serializeTag = (item: TaskPathItem) =>
  `@[${item.title.replace(/[\r\n\[\]()]/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled task'}](task:${item.id})`;

/** Rebuild only headings whose explicit IDs identify one source-grounded task. */
export const repairMeetingSynthesisStructure = (
  content: string,
  tasks: SynthesisTask[],
  directEvidenceTaskIds: Set<string>,
) => {
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const knownIds = new Set(tasks.flatMap(task => taskPath(task).map(item => item.id)));
  const violations = new Set<string>();
  const affectedTaskIds = new Set<string>();
  const repairedTaskIds = new Set<string>();
  const reject = (code: string, ids: string[]) => {
    violations.add(code);
    ids.forEach(id => affectedTaskIds.add(id));
  };

  const unknownIds = taskTags(content).filter(id => !knownIds.has(id));
  if (unknownIds.length) reject('UNKNOWN_TASK_ID', unknownIds);

  const repairedContent = content.replace(
    /^(2\.\d+(?:\.\d+)*[ \t]+)([^\r\n]+)(\r?)$/gm,
    (original, prefix: string, heading: string, carriageReturn: string) => {
      const ids = taskTags(heading);
      const candidates = [...new Set(ids)].flatMap(id => {
        const task = taskById.get(id);
        return task && directEvidenceTaskIds.has(id) ? [task] : [];
      });
      const matches = candidates.filter(task => {
        const pathIds = taskPath(task).map(item => item.id);
        return ids.every(id => pathIds.includes(id));
      });
      if (matches.length !== 1) {
        // Never infer the task from its title or silently remove a foreign path.
        reject(ids.length ? 'AMBIGUOUS_TASK_HEADING' : 'TASK_HEADING_WITHOUT_TASK_TAG', ids);
        return original;
      }
      const task = matches[0];
      const path = taskPath(task);
      if (path.at(-1)?.id !== task.id || new Set(path.map(item => item.id)).size !== path.length ||
        path.some(item => !item.id || /[)\r\n]/.test(item.id) || !item.title) ||
        tasks.filter(item => item.id === task.id).length !== 1) {
        reject('INVALID_SOURCE_TASK_PATH', [task.id]);
        return original;
      }
      const nextHeading = `${prefix}${path.map(serializeTag).join('／')}${carriageReturn}`;
      if (nextHeading !== original) repairedTaskIds.add(task.id);
      return nextHeading;
    },
  );

  return {
    content: repairedContent,
    linkedTaskIds: [...new Set(taskTags(repairedContent))],
    repairedTaskIds: [...repairedTaskIds],
    violations: [...violations],
    affectedTaskIds: [...affectedTaskIds],
  };
};
