import React from 'react';
import { FileText, KanbanSquare, Target } from 'lucide-react';
import type { RagCitation } from '../../services/rag/ragContract';

interface CitationCardProps {
  citation: RagCitation;
}

const CitationCard: React.FC<CitationCardProps> = ({ citation }) => {
  const getIcon = () => {
    switch (citation.sourceTable) {
      case 'wbs_items':
        return <KanbanSquare size={14} className="text-blue-500" />;
      case 'projects':
        return <Target size={14} className="text-purple-500" />;
      case 'documents':
        return <FileText size={14} className="text-orange-500" />;
      default:
        return <FileText size={14} className="text-slate-500" />;
    }
  };

  const getLabel = () => {
    switch (citation.sourceTable) {
      case 'wbs_items':
        return '工作分解任務';
      case 'projects':
        return '專案資料';
      case 'documents':
        return '文件';
      default:
        return '引用來源';
    }
  };

  const handleClick = () => {
    if (citation.sourceTable === 'wbs_items') {
      document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId: citation.sourceId } }));
    }
  };

  return (
    <button
      onClick={handleClick}
      className="group flex w-full items-start gap-2 rounded-md border border-slate-200 bg-white p-2 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-slate-50"
      type="button"
    >
      <div className="mt-0.5 shrink-0">{getIcon()}</div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
          {getLabel()}
        </div>
        <div className="truncate text-sm font-medium text-slate-700 transition-colors group-hover:text-blue-600">
          {citation.title || '未命名來源'}
        </div>
      </div>
    </button>
  );
};

export default CitationCard;
