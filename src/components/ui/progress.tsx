import * as React from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  color?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, color, ...props }, ref) => (
    <div ref={ref} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-gray-100', className)} {...props}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          backgroundColor: color || '#1f2937',
        }}
      />
    </div>
  )
);
Progress.displayName = 'Progress';

export { Progress };
