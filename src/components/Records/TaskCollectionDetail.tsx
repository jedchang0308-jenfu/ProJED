import React from 'react';
import dayjs from 'dayjs';
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  History,
  Link2,
  ListTree,
  LockKeyhole,
  Users,
} from 'lucide-react';
import type { TagColor, TaskCollectionRecord, TaskDetailNote, TaskTag } from '../../types';
import type { TaskCollectionNodeSnapshot, TaskCollectionSnapshot } from '../../features/taskCollection/types';
import useBoardStore from '../../store/useBoardStore';
import { useWbsStore } from '../../store/useWbsStore';
import { selectAndOpenTaskDetails } from '../../utils/taskInteractions';
import { normalizeManualTaskStatus, TASK_STATUS_LABELS } from '../../utils/taskStatus';
import { getTaskStatusFieldClass } from '../ui/taskStatusStyles';
import TaskAssignmentPicker from '../TaskAssignmentPicker';
import { TagChip } from '../Tags/TagChip';
import { TaskDetailNoteContent } from '../TaskNotes/TaskDetailNoteField';

type Props = { record: TaskCollectionRecord; onBack: () => void };

const formatTime = (value: number | null | undefined) => value ? dayjs(value).format('YYYY/MM/DD HH:mm') : '未填時間';
const formatDate = (value: string | null | undefined) => value && dayjs(value).isValid() ? dayjs(value).format('YYYY/MM/DD') : '未設定';

const toTaskNote = (note: TaskCollectionNodeSnapshot['detailNotes'][number]): TaskDetailNote => ({
  id: note.id,
  title: note.title || '備註',
  content: note.content || '',
  ...(note.richContent ? { richContent: note.richContent } : {}),
});

const getNodeNotes = (node: TaskCollectionNodeSnapshot): TaskDetailNote[] => (
  node.detailNotes?.length
    ? node.detailNotes.map(toTaskNote)
    : [{ id: `${node.storageId}-description`, title: '備註', content: node.description || '' }]
);

const getNodeAssignmentOptions = (node: TaskCollectionNodeSnapshot) => {
  const people = [
    ...(node.assignees ?? []).map(person => ({ id: person.userId, label: person.displayName || `已保存成員（${person.userId}）` })),
    ...(node.collaborators ?? []).map(person => ({ id: person.userId, label: person.displayName || `已保存成員（${person.userId}）` })),
  ];
  const knownIds = new Set(people.map(person => person.id));
  const fallbackIds = [...node.assigneeIds, ...node.collaboratorIds].filter(id => !knownIds.has(id));
  return [...people, ...Array.from(new Set(fallbackIds)).map(id => ({ id, label: `已保存成員（${id}）` }))];
};

const getNodeTags = (node: TaskCollectionNodeSnapshot): TaskTag[] => {
  const namesById = new Map((node.tags ?? []).map(tag => [tag.id, tag]));
  return node.tagIds.map((id, index) => {
    const tag = namesById.get(id);
    return {
      id,
      workspaceId: 'task-collection-snapshot',
      name: tag?.name || `已保存標籤（${id}）`,
      color: (tag?.color as TagColor) || 'gray',
      order: index,
    };
  });
};

/**
 * Read-only content parity for a task snapshot. The note renderer, status
 * field styling, assignment picker and tag chips are the same primitives used
 * by TaskDetailsModal; the snapshot never receives mutation callbacks.
 */
const TaskCollectionNodeContent: React.FC<{ node: TaskCollectionNodeSnapshot }> = ({ node }) => {
  const status = normalizeManualTaskStatus(node.status);
  const assignmentOptions = getNodeAssignmentOptions(node);
  const tags = getNodeTags(node);
  const assignmentNode = {
    assigneeId: node.assigneeIds[0],
    assigneeIds: node.assigneeIds,
    collaboratorIds: node.collaboratorIds,
    nodeType: node.nodeType,
    isArchived: node.isArchived,
    status: node.status,
  };
  const notes = getNodeNotes(node);

  return (
    <section className="border-t border-slate-100 pt-4" data-task-collection-node-content="true" data-task-collection-node-storage-id={node.storageId}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">任務內容</p>
          <h2 className="mt-1 truncate text-base font-semibold text-slate-900" title={node.title}>{node.title || '未命名任務'}</h2>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500">
          <LockKeyhole size={12} aria-hidden="true" />唯讀快照
        </span>
      </div>

      <div className="grid gap-3" data-task-details-meta-section="true" data-task-collection-content-meta="true">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-task-details-meta-grid="true">
          <div data-task-details-meta-field="start">
            <span className="block text-xs font-medium text-slate-500">開始日期</span>
            <span className="mt-1 inline-flex min-h-8 w-full items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 text-sm text-slate-600">
              <CalendarDays size={14} className="shrink-0 text-slate-400" aria-hidden="true" />{formatDate(node.startDate)}
            </span>
          </div>
          <div data-task-details-meta-field="end">
            <span className="block text-xs font-medium text-slate-500">結束日期</span>
            <span className="mt-1 inline-flex min-h-8 w-full items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 text-sm text-slate-600">
              <CalendarDays size={14} className="shrink-0 text-slate-400" aria-hidden="true" />{formatDate(node.endDate)}
            </span>
          </div>
          <div data-task-details-meta-field="duration">
            <span className="block text-xs font-medium text-slate-500">工期</span>
            <span className="mt-1 inline-flex min-h-8 w-full items-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 text-sm text-slate-600">
              {node.startDate && node.endDate && dayjs(node.endDate).isValid() && dayjs(node.startDate).isValid()
                ? `${dayjs(node.endDate).diff(dayjs(node.startDate), 'day')} 天`
                : '未設定'}{node.isDurationLocked ? ' · 已鎖定' : ''}
            </span>
          </div>
          <div data-task-details-meta-field="status">
            <span className="block text-xs font-medium text-slate-500">狀態</span>
            <span className={`${getTaskStatusFieldClass(status)} mt-1 inline-flex h-8 w-full items-center justify-center`} aria-label={`任務狀態：${TASK_STATUS_LABELS[status]}`}>
              {TASK_STATUS_LABELS[status]}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2" data-task-collection-content-assignment-row="true">
          <div data-task-details-meta-field="assignment">
            <span className="block text-xs font-medium text-slate-500">主責／協作</span>
            <div className="mt-1" data-task-collection-readonly-assignment="true">
              <TaskAssignmentPicker
                node={assignmentNode}
                options={assignmentOptions}
                disabled
                fullSummary
                onChange={() => undefined}
              />
            </div>
          </div>
          <div data-task-details-meta-field="tags">
            <span className="block text-xs font-medium text-slate-500">標籤</span>
            <div className="mt-1 flex min-h-8 flex-wrap items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-1" data-task-collection-readonly-tags="true">
              {tags.length ? tags.map(tag => <TagChip key={tag.id} tag={tag} compact />) : <span className="text-sm text-slate-400">未設定</span>}
            </div>
          </div>
        </div>
      </div>

      <section className="mt-4" data-task-detail-notes-section="true" data-task-collection-content-notes="true">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500"><span>內容／備註</span><span className="text-[11px] text-slate-400">{notes.length} 欄</span></div>
        <div className="grid gap-2" data-task-detail-notes-grid="true">
          {notes.map(note => (
            <div key={note.id} className="relative min-w-0" data-task-detail-note-card="true">
              <div className="mb-1 flex min-w-0 items-center gap-2" data-task-detail-note-header="true">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800" title={note.title}>{note.title}</span>
                <span className="shrink-0 text-[10px] font-medium text-slate-400">唯讀</span>
              </div>
              <div className="min-h-[96px] rounded-md border border-slate-200/70 bg-slate-50/70 px-2 py-1.5" data-task-detail-note-content="true">
                <TaskDetailNoteContent note={note} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
};

const TaskCollectionDetail: React.FC<Props> = ({ record, onBack }) => {
  const [treeExpanded, setTreeExpanded] = React.useState(true);
  const [selectedNodeStorageId, setSelectedNodeStorageId] = React.useState<string | null>(null);
  const detailHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const setView = useBoardStore(state => state.setView);
  const snapshot = record.metadata?.taskCollection as TaskCollectionSnapshot | undefined;
  const sourceExists = useWbsStore(state => Boolean(snapshot?.source?.rootTaskId && state.nodes[snapshot.source.rootTaskId]));
  const nodesByParent = React.useMemo(() => {
    const map = new Map<string | null, TaskCollectionSnapshot['nodes']>();
    (snapshot?.nodes ?? []).forEach(node => {
      const parentKey = node.parentStorageId ?? (node.parentId === null ? null : node.parentId);
      map.set(parentKey, [...(map.get(parentKey) ?? []), node]);
    });
    return map;
  }, [snapshot]);
  const rootNode = React.useMemo(() => {
    if (!snapshot?.nodes?.length) return undefined;
    return snapshot.nodes.find(node => node.storageId === snapshot.rootStorageId)
      || snapshot.nodes.find(node => node.id === snapshot.rootItemId)
      || snapshot.nodes[0];
  }, [snapshot]);
  const selectedNode = React.useMemo(() => (
    snapshot?.nodes.find(node => node.storageId === selectedNodeStorageId) || rootNode
  ), [rootNode, selectedNodeStorageId, snapshot]);

  React.useLayoutEffect(() => {
    detailHeadingRef.current?.focus();
  }, [record.id]);
  React.useEffect(() => {
    if (rootNode && !selectedNodeStorageId) setSelectedNodeStorageId(rootNode.storageId);
  }, [rootNode, selectedNodeStorageId]);

  if (!snapshot || snapshot.schema !== 'task-collection-v1' || !Array.isArray(snapshot.nodes)) {
    return <div className="flex h-full flex-col bg-slate-50" data-task-collection-detail-id={record.id} data-task-collection-source-state="incompatible"><div className="flex h-14 items-center border-b border-slate-200 bg-white px-5"><button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600"><ArrowLeft size={15} />返回典藏任務</button></div><div className="p-5"><div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">此典藏資產的快照版本目前無法顯示；資產仍予以保留。</div></div></div>;
  }

  const openSource = () => {
    if (!sourceExists) return;
    setView('board');
    selectAndOpenTaskDetails(snapshot.source.rootTaskId);
  };

  const renderNodes = (parentStorageId: string | null, depth = 0, visited = new Set<string>()): React.ReactNode => (
    [...(nodesByParent.get(parentStorageId) ?? [])]
      .sort((a, b) => a.order - b.order || a.storageId.localeCompare(b.storageId))
      .map(node => {
        if (visited.has(node.storageId)) return null;
        const nextVisited = new Set(visited).add(node.storageId);
        const isSelected = selectedNode?.storageId === node.storageId;
        const status = normalizeManualTaskStatus(node.status);
        return <React.Fragment key={node.storageId}>
          <button
            type="button"
            onClick={() => setSelectedNodeStorageId(node.storageId)}
            aria-pressed={isSelected}
            data-task-collection-node-trigger={node.storageId}
            className={`flex w-full items-start gap-2 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500 ${isSelected ? 'rounded-md bg-blue-50/70' : 'hover:bg-slate-50'}`}
            style={{ paddingLeft: depth * 18 + 4 }}
          >
            <span className="mt-0.5 text-blue-500" aria-hidden="true">•</span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-800">{node.title || '未命名任務'}</span>
              <span className="mt-0.5 block text-[11px] text-slate-400">{TASK_STATUS_LABELS[status]}{node.isArchived ? ' · 已封存' : ''}</span>
            </span>
          </button>
          {treeExpanded ? renderNodes(node.storageId, depth + 1, nextVisited) : null}
        </React.Fragment>;
      })
  );

  const historyCoverage = snapshot.historyCoverage ?? snapshot.history?.coverage;
  const dependencies = snapshot.dependencies ?? [];
  const linkedRecords = snapshot.linkedRecords ?? snapshot.relatedRecords?.records ?? [];

  return <div className="flex h-full flex-col bg-slate-50" data-task-collection-detail-id={record.id}>
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600"><ArrowLeft size={15} />返回典藏任務</button>
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Archive size={14} />版本 {record.collectionVersion ?? 1}</span>
    </div>
    <div className="flex-1 overflow-auto p-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-5" data-task-collection-source-section>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><h1 ref={detailHeadingRef} tabIndex={-1} className="text-lg font-semibold text-slate-900">{record.title}</h1><p className="mt-1 text-xs text-slate-500">來源看板：{snapshot.sourceBoardTitle || snapshot.source.boardTitle} · 典藏時間：{formatTime(snapshot.collectedAt || record.occurredAt || record.createdAt)} · 典藏者：{snapshot.collectedBy.displayName || snapshot.collectedBy.userId}</p></div>
            {sourceExists ? <button type="button" onClick={openSource} data-task-collection-open-source="true" className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"><ExternalLink size={13} />開啟來源任務</button> : <span className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs text-slate-500" data-task-collection-source-state="deleted">來源任務已不存在</span>}
          </div>
          <p className="mt-2 text-xs text-slate-500" data-task-collection-source-state={sourceExists ? 'available' : 'deleted'}>{sourceExists ? '來源任務仍存在；本頁內容為唯讀快照。' : '來源任務已不存在；典藏資產仍予以保留。'}</p>
          {snapshot.annotation ? <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">典藏註記：{snapshot.annotation}</div> : null}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5" data-task-collection-tree>
          <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ListTree size={15} />任務樹（{snapshot.nodes.length}）</h2><button type="button" onClick={() => setTreeExpanded(value => !value)} aria-expanded={treeExpanded} data-task-collection-tree-toggle="true" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">{treeExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{treeExpanded ? '收合' : '展開'}</button></div>
          {treeExpanded ? <div className="mt-3 divide-y divide-slate-100">{renderNodes(null)}</div> : <p className="mt-3 text-xs text-slate-400">任務樹已收合。</p>}
          {selectedNode ? <TaskCollectionNodeContent node={selectedNode} /> : <p className="mt-4 text-xs text-slate-400">沒有可顯示的任務內容。</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5" data-task-collection-dependencies>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Link2 size={15} />相依關係（{dependencies.length}）</h2>
          {dependencies.length ? <div className="mt-3 space-y-2">{dependencies.map(dependency => <div key={dependency.id} className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600"><div className="font-medium text-slate-700">{dependency.from?.title || dependency.fromId} → {dependency.to?.title || dependency.toId}</div><div className="mt-1 text-[11px] text-slate-400">{dependency.kind === 'boundary' ? '邊界相依' : '子樹內相依'} · {dependency.fromSide} → {dependency.toSide}{dependency.offsetDays ?? dependency.offset ? ` · 偏移 ${dependency.offsetDays ?? dependency.offset} 天` : ''}</div></div>)}</div> : <p className="mt-3 text-xs text-slate-400">沒有相依關係。</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5" data-task-collection-history>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><History size={15} />歷程資產</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600"><div>活動事件：{historyCoverage?.activityEvents ?? 0}</div><div>關聯紀錄：{historyCoverage?.linkedRecords ?? 0}</div></div>
          {snapshot.activityEvents.length ? <div className="mt-3 space-y-1 text-xs text-slate-500">{snapshot.activityEvents.map(event => <div key={event.id}>{formatTime(event.createdAt)} · {event.eventType}</div>)}</div> : <p className="mt-3 text-xs text-slate-400">沒有可顯示的活動事件。</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5" data-task-collection-related-records>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Users size={15} />相關紀錄片段（{linkedRecords.length}）</h2>
          {linkedRecords.length ? <div className="mt-3 space-y-2">{linkedRecords.map(linked => <div key={linked.id} className="rounded-md bg-slate-50 px-3 py-2"><div className="text-xs font-medium text-slate-700">{linked.title}</div><div className="mt-1 line-clamp-3 text-xs leading-5 text-slate-500">{linked.excerpt || linked.content}</div><div className="mt-1 text-[11px] text-slate-400">{linked.type === 'meeting' ? '會議紀錄' : '個人工作紀錄'} · {formatTime(linked.occurredAt || linked.endedAt || linked.startedAt)}</div></div>)}</div> : <p className="mt-3 text-xs text-slate-400">沒有可顯示的專案公開相關紀錄。</p>}
        </section>
      </div>
    </div>
  </div>;
};

export default TaskCollectionDetail;
