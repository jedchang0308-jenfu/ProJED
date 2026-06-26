import React from 'react';
import type { MindMapRelationshipPath, MindMapRelationshipStyle } from './mindMapGeometry';

interface RelationshipDashOption {
  label: string;
  value: string;
}

interface MindMapRelationshipStyleDrawerProps {
  path: MindMapRelationshipPath;
  colorOptions: string[];
  widthOptions: number[];
  dashOptions: RelationshipDashOption[];
  onUpdateStyle: (relationshipId: string, patch: MindMapRelationshipStyle) => void;
  onResetStyle: (relationshipId: string) => void;
}

const stopPanelEvent = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

const MindMapRelationshipStyleDrawer: React.FC<MindMapRelationshipStyleDrawerProps> = ({
  path,
  colorOptions,
  widthOptions,
  dashOptions,
  onUpdateStyle,
  onResetStyle,
}) => (
  <aside
    className="fixed bottom-0 right-0 top-[88px] z-[60] flex w-[320px] max-w-[calc(100vw-16px)] flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-slate-50 px-6 py-5 text-xs font-semibold text-slate-600 shadow-[-12px_0_28px_rgba(15,23,42,0.10)]"
    onClick={stopPanelEvent}
    onPointerDown={stopPanelEvent}
    data-mindmap-note-relationship-style-panel={path.id}
    data-mindmap-note-relationship-style-drawer="true"
  >
    <div className="-mx-6 -mt-5 grid grid-cols-2 border-b border-slate-200 text-center text-sm">
      <div className="bg-blue-600 px-4 py-3 font-semibold text-white">樣式</div>
      <div className="px-4 py-3 font-semibold text-slate-500">畫布</div>
    </div>
    <div className="-mx-6 border-b border-slate-200 px-6 pb-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">關聯線</span>
        <span className="rounded border border-slate-200 bg-white px-3 py-1.5 text-2xl leading-none text-slate-900">~</span>
      </div>
    </div>
    <div className="flex items-center gap-1" data-mindmap-note-relationship-style-colors>
      {colorOptions.map(color => (
        <button
          key={color}
          type="button"
          className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${path.style.strokeColor === color ? 'border-slate-900 ring-2 ring-sky-100' : 'border-slate-200'}`}
          style={{ backgroundColor: color }}
          title={`線條顏色 ${color}`}
          onClick={() => onUpdateStyle(path.id, { strokeColor: color })}
          data-mindmap-note-relationship-style-color={color}
        />
      ))}
    </div>
    <div className="mx-1 h-5 w-px bg-slate-200" />
    <div className="flex items-center gap-1" data-mindmap-note-relationship-style-widths>
      {widthOptions.map(width => (
        <button
          key={width}
          type="button"
          className={`rounded border px-1.5 py-0.5 ${path.style.strokeWidth === width ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
          onClick={() => onUpdateStyle(path.id, { strokeWidth: width })}
          data-mindmap-note-relationship-style-width={width}
        >
          {width}
        </button>
      ))}
    </div>
    <div className="flex items-center gap-1" data-mindmap-note-relationship-style-dashes>
      {dashOptions.map(option => (
        <button
          key={option.label}
          type="button"
          className={`rounded border px-1.5 py-0.5 ${path.style.strokeDasharray === option.value ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
          onClick={() => onUpdateStyle(path.id, { strokeDasharray: option.value })}
          data-mindmap-note-relationship-style-dash={option.value || 'solid'}
        >
          {option.label}
        </button>
      ))}
    </div>
    <div className="flex items-center gap-1" data-mindmap-note-relationship-style-arrows>
      <button
        type="button"
        className={`rounded border px-1.5 py-0.5 ${!path.style.arrowStart && !path.style.arrowEnd ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
        onClick={() => onUpdateStyle(path.id, { arrowStart: false, arrowEnd: false })}
        data-mindmap-note-relationship-style-arrow="none"
      >
        無箭頭
      </button>
      <button
        type="button"
        className={`rounded border px-1.5 py-0.5 ${!path.style.arrowStart && path.style.arrowEnd ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
        onClick={() => onUpdateStyle(path.id, { arrowStart: false, arrowEnd: true })}
        data-mindmap-note-relationship-style-arrow="end"
      >
        單箭頭
      </button>
      <button
        type="button"
        className={`rounded border px-1.5 py-0.5 ${path.style.arrowStart && path.style.arrowEnd ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
        onClick={() => onUpdateStyle(path.id, { arrowStart: true, arrowEnd: true })}
        data-mindmap-note-relationship-style-arrow="both"
      >
        雙箭頭
      </button>
    </div>
    <div className="flex items-center gap-1" data-mindmap-note-relationship-style-label-fonts>
      {[11, 12, 14].map(size => (
        <button
          key={size}
          type="button"
          className={`rounded border px-1.5 py-0.5 ${path.style.labelFontSize === size ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
          onClick={() => onUpdateStyle(path.id, { labelFontSize: size })}
          data-mindmap-note-relationship-style-label-size={size}
        >
          {size}
        </button>
      ))}
    </div>
    <button
      type="button"
      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 hover:bg-slate-50"
      onClick={() => onResetStyle(path.id)}
      data-mindmap-note-relationship-style-reset
    >
      Reset
    </button>
  </aside>
);

export default MindMapRelationshipStyleDrawer;
