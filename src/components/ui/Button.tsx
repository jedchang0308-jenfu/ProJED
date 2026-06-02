import React from 'react';
import { cn } from '../../utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'dashed';
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'none';
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, fullWidth, children, disabled, ...props }, ref) => {
    
    const baseStyles = "inline-flex items-center justify-center font-semibold transition-all focus:outline-none disabled:opacity-50 disabled:pointer-events-none";
    
    const variants = {
      primary: "bg-primary text-white hover:bg-primary/90 shadow-[0_8px_18px_rgba(99,102,241,0.22)] rounded-lg",
      secondary: "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 rounded-lg shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
      danger: "bg-red-500 text-white hover:bg-red-600 shadow-[0_8px_18px_rgba(239,68,68,0.20)] rounded-lg",
      ghost: "hover:bg-primary/5 text-slate-600 hover:text-primary rounded-lg",
      dashed: "border border-dashed border-slate-300 text-slate-400 hover:border-primary/40 hover:text-primary hover:bg-primary/5 bg-transparent rounded-lg",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs",
      md: "h-10 px-4 py-2 text-sm",
      lg: "h-12 px-8 text-base",
      icon: "h-8 w-8 p-1",
      none: "", // For custom padding/height overrides
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
