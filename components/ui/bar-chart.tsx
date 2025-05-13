'use client'

import { cn } from '@/lib/utils'

type BarChartProps = {
  data: {
    name: string
    value: number
  }[]
  className?: string
}

export function BarChart({ data, className }: BarChartProps) {
  const maxValue = Math.max(...data.map(item => item.value))

  return (
    <div className={cn('space-y-2', className)}>
      {data.map((item, index) => (
        <div key={item.name} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{item.name}</span>
            <span className="text-muted-foreground">{item.value.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                `bg-chart-${(index % 5) + 1}`
              )}
              style={{ width: `${(item.value / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
} 