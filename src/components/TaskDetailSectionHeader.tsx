import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type SectionContainerProps = Omit<HTMLAttributes<HTMLDivElement>, 'className'>;

type SectionHeaderProps = SectionContainerProps & {
  titleContent: ReactNode;
};

export function TaskDetailSectionHeader({ titleContent, children, ...props }: SectionHeaderProps) {
  return (
    <div {...props} className="relative mb-1 flex min-w-0 flex-wrap items-center gap-1 md:flex-nowrap">
      <div className="flex h-9 w-[60pt] shrink-0 items-center whitespace-nowrap text-sm font-semibold text-slate-800 md:h-7">
        {titleContent}
      </div>
      {children}
    </div>
  );
}

export function TaskDetailSectionActions({ children, ...props }: SectionContainerProps) {
  return (
    <div {...props} className="inline-flex h-7 shrink-0 items-stretch">
      {children}
    </div>
  );
}

type SectionActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'danger';
};

export function TaskDetailSectionAction({ tone, className = '', ...props }: SectionActionProps) {
  const colors = tone === 'danger'
    ? 'text-slate-400 enabled:hover:bg-red-50 enabled:hover:text-red-600 focus-visible:ring-red-100'
    : 'text-slate-500 enabled:hover:bg-slate-100 enabled:hover:text-slate-900 focus-visible:ring-blue-200 aria-expanded:bg-blue-50 aria-expanded:text-blue-700';

  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-full w-7 shrink-0 items-center justify-center border-0 bg-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40 ${colors} ${className}`}
    />
  );
}
