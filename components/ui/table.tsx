import * as React from 'react';

import { cn } from '@/lib/utils';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {}

export const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, ...props }, ref) => (
    <table
      ref={ref}
      className={cn('w-full border-collapse rounded-md overflow-hidden', className)}
      {...props}
    />
  )
);

Table.displayName = 'Table'; 