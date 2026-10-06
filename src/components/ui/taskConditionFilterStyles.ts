export const taskFilterFieldClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

/**
 * Shared pill geometry for filter choices. Color remains semantic per filter
 * family, while height, radius, focus and disabled behavior stay consistent.
 */
export const taskFilterChoiceBaseClass =
  'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50';

/** Shared active/inactive treatment for every filter choice. */
export const taskFilterChoiceActiveClass =
  'border-primary-600 bg-primary-600 text-white shadow-[0_1px_2px_rgba(79,70,229,0.22)] ring-2 ring-primary-200/90';

export const taskFilterChoiceInactiveClass =
  'border-slate-300 bg-white text-slate-600 hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700';

/** Shared trigger treatment for board and workbench filter entry points. */
export const getTaskFilterTriggerClass = (active: boolean, open: boolean) =>
  active
    ? 'border-primary-600 bg-primary-600 text-white shadow-[0_2px_5px_rgba(79,70,229,0.28)] ring-2 ring-primary-200/90 hover:border-primary-700 hover:bg-primary-700 hover:text-white'
    : open
      ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm ring-2 ring-primary-200/80 hover:bg-primary-100'
      : 'border-slate-300 bg-white text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700';

export const taskFilterChoiceGroupClass =
  'inline-flex h-8 min-h-[34px] items-stretch overflow-hidden rounded-full border bg-white transition-colors focus-within:ring-2 focus-within:ring-primary/20';

export const getTaskFilterChoiceClass = (active: boolean, disabled = false) =>
  `${taskFilterChoiceBaseClass} ${
    active
      ? taskFilterChoiceActiveClass
      : taskFilterChoiceInactiveClass
  } ${disabled ? 'hover:border-slate-300 hover:bg-white hover:text-slate-600' : ''}`;
