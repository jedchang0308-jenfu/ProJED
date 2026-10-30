import type {TaskNode} from '../src/types/index.js';
import {taskNoteToAiMarkdown} from '../src/utils/taskNoteRichContent.js';

export type WbsRagSourceInput=Pick<TaskNode,'title'|'nodeType'|'status'|'startDate'|'endDate'|'description'|'detailNotes'>;

/** Preserve the existing WBS index representation, including its historical
 * UTF-16 FNV hash. Freshness readers must compare canonical content as well. */
export function buildWbsRagSource(node:WbsRagSourceInput,tagNames:readonly string[]=[]):{content:string;contentHash:string}{
  const detailNotes=(node.detailNotes??[]).flatMap(note=>{
    const title=note.title.trim(),content=taskNoteToAiMarkdown(note).trim();
    return title||content?[[`## 備註：${title||'未命名'}`,`備註 ID：${note.id}`,content].filter(Boolean).join('\n\n')]:[];
  });
  const schedule=node.startDate&&node.endDate?`${node.startDate} 至 ${node.endDate}`
    :node.startDate?`開始：${node.startDate}`:node.endDate?`結束：${node.endDate}`:null;
  const content=[`標題：${node.title}`,`類型：${node.nodeType??'task'}`,`狀態：${node.status}`,
    tagNames.length?`標籤：${tagNames.join(', ')}`:null,schedule?`排程：${schedule}`:null,
    detailNotes.length===0&&node.description?.trim()?`描述：\n${node.description.trim()}`:null,
    ...detailNotes].filter(Boolean).join('\n\n');
  let hash=0x811c9dc5;
  for(let index=0;index<content.length;index++){hash^=content.charCodeAt(index);hash=Math.imul(hash,0x01000193);}
  return {content,contentHash:`fnv1a32:${(hash>>>0).toString(16).padStart(8,'0')}`};
}
