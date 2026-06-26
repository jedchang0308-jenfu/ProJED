export const COMPACT_DIMENSIONS = {
  toolbarHeight: 48,
  taskRowHeight: 26,
  ganttBarHeight: 18,
  calendarHeaderHeight: 22,
  calendarLaneHeight: 16,
  calendarLaneGap: 2,
};

export const compactClassNames = {
  toolbar:
    'app-compact-toolbar h-12 border-b border-slate-200/80 bg-white/85 backdrop-blur-md flex items-center justify-between px-[12px] shrink-0 shadow-[0_1px_0_rgba(15,23,42,0.04)]',
  toolbarLeft: 'app-compact-toolbar-left flex flex-1 items-center gap-[10px] min-w-0 mr-[10px]',
  toolbarRight: 'app-compact-toolbar-right flex shrink-0 items-center gap-[10px]',
  canvas: 'app-compact-canvas px-[12px] py-[10px]',
  segmented: 'app-compact-segmented flex items-center gap-px rounded-lg bg-slate-100/80 p-0.5 shadow-inner ring-1 ring-slate-200/70',
  segmentedButtonBase:
    'app-compact-segmented-button inline-flex h-[30px] items-center justify-center gap-1.5 rounded-md px-[11px] text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50',
  iconButtonBase:
    'app-compact-icon-button inline-flex h-[30px] w-[30px] items-center justify-center rounded-md text-slate-500 transition-all hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50',
  textButtonBase:
    'app-compact-text-button inline-flex h-[30px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-[11px] text-xs font-semibold text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50',
  metaBadge:
    'app-compact-meta-badge inline-flex items-center gap-1 rounded-full border border-transparent px-1.5 py-0.5 text-[10px] font-semibold leading-none shadow-[0_1px_1px_rgba(15,23,42,0.03)]',
  taskTitle: 'task-title-text text-sm font-semibold leading-snug',
  taskMeta: 'text-[11px] leading-tight',
};

export const compactSegmentedButtonClass = (active: boolean) =>
  `${compactClassNames.segmentedButtonBase} ${
    active
      ? 'bg-white text-primary shadow-sm ring-1 ring-primary/20'
      : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
  }`;

export const compactIconButtonClass = (active = false) =>
  `${compactClassNames.iconButtonBase} ${active ? 'bg-white text-primary shadow-sm ring-1 ring-primary/20' : ''}`;
