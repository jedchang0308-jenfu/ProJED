import React from 'react';
import { cn } from '../../utils/cn';
import {
  compactClassNames,
  compactIconButtonClass,
  compactSegmentedButtonClass,
} from './compactTokens';

export type CompactButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export const CompactSegmentedControl: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div className={cn(compactClassNames.segmented, className)} {...props} />
);

export const CompactSegmentedButton = React.forwardRef<HTMLButtonElement, CompactButtonProps>(
  ({ active = false, className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(compactSegmentedButtonClass(active), className)}
      {...props}
    />
  )
);
CompactSegmentedButton.displayName = 'CompactSegmentedButton';

export const CompactIconButton = React.forwardRef<HTMLButtonElement, CompactButtonProps>(
  ({ active = false, className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(compactIconButtonClass(active), className)}
      {...props}
    />
  )
);
CompactIconButton.displayName = 'CompactIconButton';

export const CompactTextButton = React.forwardRef<HTMLButtonElement, CompactButtonProps>(
  ({ active = false, className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(compactClassNames.textButtonBase, active && 'border-primary/30 bg-primary/10 text-primary', className)}
      {...props}
    />
  )
);
CompactTextButton.displayName = 'CompactTextButton';

export const TaskMetaBadge: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({
  className,
  ...props
}) => (
  <span className={cn(compactClassNames.metaBadge, className)} {...props} />
);
