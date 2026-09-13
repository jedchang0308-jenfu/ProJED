export const taskFilterFieldClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

/**
 * Shared pill geometry for filter choices. Color remains semantic per filter
 * family, while height, radius, focus and disabled behavior stay consistent.
 */
export const taskFilterChoiceBaseClass =
  'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50';

export const taskFilterChoiceGroupClass =
  'inline-flex h-8 min-h-[34px] items-stretch overflow-hidden rounded-full border bg-white transition-colors focus-within:ring-2 focus-within:ring-primary/20';

export const getTaskFilterChoiceClass = (active: boolean, disabled = false) =>
  `${taskFilterChoiceBaseClass} ${
    active
      ? 'border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/20'
      : 'border-slate-300 bg-white text-slate-600 hover:border-primary/25 hover:bg-primary/5 hover:text-primary'
  } ${disabled ? 'hover:border-slate-300 hover:bg-white hover:text-slate-600' : ''}`;
