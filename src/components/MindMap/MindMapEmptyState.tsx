import React from 'react';
import { Network } from 'lucide-react';
import { Button } from '../ui/Button';

interface MindMapEmptyStateProps {
  canCreateTask: boolean;
  onCreateRoot: () => void;
}

const MindMapEmptyState: React.FC<MindMapEmptyStateProps> = ({ canCreateTask, onCreateRoot }) => (
  <div className="flex h-full min-h-[360px] items-center justify-center">
    <div className="max-w-sm rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center" data-mindmap-empty>
      <Network className="mx-auto mb-3 text-slate-400" size={32} />
      <div className="text-sm font-bold text-slate-700">尚無心智圖任務</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">
        新增第一個任務後，可用 Enter 新增同階，Tab 新增子任務。
      </div>
      <Button
        type="button"
        size="sm"
        className="mt-4"
        onClick={onCreateRoot}
        disabled={!canCreateTask}
      >
        新增第一個任務
      </Button>
    </div>
  </div>
);

export default MindMapEmptyState;
