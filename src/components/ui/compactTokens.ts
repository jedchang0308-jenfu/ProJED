export const COMPACT_DIMENSIONS = {
  toolbarHeight: 48,
  taskRowHeight: 22,
  ganttBarHeight: 18,
  calendarHeaderHeight: 22,
  calendarLaneHeight: 16,
  calendarLaneGap: 2,
};

export const compactClassNames = {
  toolbar:
    'h-12 border-b border-slate-200 bg-white/50 backdrop-blur-sm flex items-center justify-between px-[10px] shrink-0',
  toolbarLeft: 'flex flex-1 items-center gap-[8px] min-w-0 mr-[8px]',
  toolbarRight: 'flex shrink-0 items-center gap-[8px]',
  canvas: 'px-[10px] py-[6px]',
  segmented: 'flex items-center gap-px rounded-lg bg-slate-100 p-px shadow-inner',
  segmentedButtonBase:
    'inline-flex h-[30px] items-center justify-center gap-1.5 rounded-md px-[10px] text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50',
  iconButtonBase:
    'inline-flex h-[30px] w-[30px] items-center justify-center rounded-md text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50',
  textButtonBase:
    'inline-flex h-[30px] items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-[10px] text-xs font-semibold text-slate-600 shadow-sm transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50',
  metaBadge:
    'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium leading-none',
  taskTitle: 'task-title-text text-sm font-medium leading-tight',
  taskMeta: 'text-[10px] leading-tight',
};

export const compactSegmentedButtonClass = (active: boolean) =>
  `${compactClassNames.segmentedButtonBase} ${
    active ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
  }`;

export const compactIconButtonClass = (active = false) =>
  `${compactClassNames.iconButtonBase} ${active ? 'bg-white text-primary shadow-sm' : ''}`;
