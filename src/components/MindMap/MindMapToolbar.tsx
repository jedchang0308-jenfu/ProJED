import React from 'react';
import { Link2, Maximize2, Network, Plus, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '../ui/Button';
import { compactClassNames } from '../ui/compactTokens';

interface MindMapToolbarProps {
  isReadOnly: boolean;
  canEditTask: boolean;
  canCreateTask: boolean;
  relationshipToolActive: boolean;
  relationshipDraftFromId: string;
  zoomLevel: number;
  zoomLabelRef: React.RefObject<HTMLSpanElement | null>;
  onToggleRelationshipTool: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomReset: () => void;
  onZoomFit: () => void;
  onCreateRoot: () => void;
}

const MindMapToolbar: React.FC<MindMapToolbarProps> = ({
  isReadOnly,
  canEditTask,
  canCreateTask,
  relationshipToolActive,
  relationshipDraftFromId,
  zoomLevel,
  zoomLabelRef,
  onToggleRelationshipTool,
  onZoomOut,
  onZoomIn,
  onZoomReset,
  onZoomFit,
  onCreateRoot,
}) => (
  <div className={compactClassNames.toolbar}>
    <div className={compactClassNames.toolbarLeft}>
      <div className="flex min-w-0 items-center gap-2">
        <Network size={16} className="shrink-0 text-blue-500" />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-700">心智圖</div>
          <div className="hidden truncate text-[11px] text-slate-500 sm:block">Enter 新增同階，Tab 新增子任務，Delete 刪除</div>
        </div>
      </div>
    </div>
    <div className={compactClassNames.toolbarRight}>
      <div className="flex items-center gap-2">
        {isReadOnly ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
            唯讀
          </span>
        ) : null}
        <Button
          type="button"
          size="none"
          variant="secondary"
          onClick={onToggleRelationshipTool}
          disabled={!canEditTask}
          title={relationshipToolActive ? '取消關聯線' : '建立筆記型關聯線'}
          className={`flex h-[30px] items-center gap-1.5 px-[10px] py-[5px] text-xs ${relationshipToolActive ? 'border-sky-300 bg-sky-50 text-sky-700 shadow-[0_0_0_3px_rgba(125,211,252,0.22)]' : ''}`}
          data-mindmap-note-relationship-tool
          data-active={relationshipToolActive ? 'true' : 'false'}
          data-source-node-id={relationshipDraftFromId}
        >
          <Link2 size={15} />
          <span>{relationshipDraftFromId ? '選擇目標' : '關聯線'}</span>
        </Button>
        <div className="flex items-center rounded-md border border-slate-200 bg-white p-0.5 shadow-sm" data-mindmap-zoom-controls>
          <Button
            type="button"
            size="none"
            variant="ghost"
            onClick={onZoomOut}
            className="flex h-7 w-7 items-center justify-center p-0"
            title="縮小"
            data-mindmap-zoom-out
          >
            <ZoomOut size={14} />
          </Button>
          <span ref={zoomLabelRef} className="min-w-[48px] px-1 text-center text-[11px] font-semibold text-slate-600" data-mindmap-zoom-label>
            {Math.round(zoomLevel * 100)}%
          </span>
          <Button
            type="button"
            size="none"
            variant="ghost"
            onClick={onZoomIn}
            className="flex h-7 w-7 items-center justify-center p-0"
            title="放大"
            data-mindmap-zoom-in
          >
            <ZoomIn size={14} />
          </Button>
          <Button
            type="button"
            size="none"
            variant="ghost"
            onClick={onZoomReset}
            className="flex h-7 w-7 items-center justify-center p-0"
            title="重設 100%"
            data-mindmap-zoom-reset
          >
            <RotateCcw size={14} />
          </Button>
          <Button
            type="button"
            size="none"
            variant="ghost"
            onClick={onZoomFit}
            className="flex h-7 w-7 items-center justify-center p-0"
            title="符合內容"
            data-mindmap-zoom-fit
          >
            <Maximize2 size={14} />
          </Button>
        </div>
        <Button
          type="button"
          size="none"
          variant="secondary"
          onClick={onCreateRoot}
          disabled={!canCreateTask}
          title={canCreateTask ? '新增根任務' : '沒有新增權限'}
          className="flex h-[30px] items-center gap-1.5 px-[10px] py-[5px] text-xs"
          data-mindmap-create-root
        >
          <Plus size={15} />
          <span>新增任務</span>
        </Button>
      </div>
    </div>
  </div>
);

export default MindMapToolbar;
