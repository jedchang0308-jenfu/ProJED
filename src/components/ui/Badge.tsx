import React from 'react';
import { cn } from '../../utils/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', size = 'sm', icon, children, ...props }, ref) => {
    
    const baseStyles = "inline-flex items-center rounded border font-medium transition-colors";
    
    const variants = {
      default: "bg-slate-50 border-slate-100 text-slate-400",
      success: "bg-emerald-50 border-emerald-200 text-emerald-600",
      warning: "bg-orange-50 border-orange-200 text-orange-600",
      danger: "bg-red-50 border-red-200 text-red-600",
      info: "bg-blue-50 border-blue-200 text-blue-600",
    };

    const sizes = {
      sm: "px-1.5 py-0.5 text-[10px] gap-1",
      md: "px-2.5 py-0.5 text-xs gap-1.5",
    };

    return (
      <div
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {icon && <span className="flex-shrink-0 flex items-center justify-center">{icon}</span>}
        {children}
      </div>
    );
  }
);
Badge.displayName = "Badge";
