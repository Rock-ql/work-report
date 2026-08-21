import * as React from 'react'
import { cn } from '@/lib/utils'

/** 内容区顶栏：标题 + 副标题 + 右侧操作 */
export function TopBar({
  title,
  subtitle,
  actions,
  sticky = true,
  children,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  sticky?: boolean
  children?: React.ReactNode
}) {
  return (
    <header
      className={cn(
        'z-20 border-b border-border bg-background/85 backdrop-blur-md',
        sticky && 'sticky top-0',
      )}
    >
      <div className="flex h-13 items-center gap-3 px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[14px] font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{subtitle}</div>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

/** 内容容器：统一最大宽度与内边距 */
export function PageBody({
  className,
  wide,
  children,
}: {
  className?: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn('mx-auto w-full px-6 py-5', wide ? 'max-w-[1280px]' : 'max-w-[1120px]', className)}>
      {children}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('relative overflow-hidden rounded-card border border-dashed border-border', className)}>
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="relative flex flex-col items-center justify-center px-6 py-14 text-center">
        <div className="mb-3 flex size-11 items-center justify-center rounded-[10px] border border-border bg-surface shadow-card">
          <Icon className="size-5 text-subtle" />
        </div>
        <p className="text-[13.5px] font-medium">{title}</p>
        {description && (
          <p className="mt-1.5 max-w-[380px] text-[12.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

/** 列表加载骨架 */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card-surface flex items-center gap-4 p-4">
          <Skeleton className="size-9 rounded-[8px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-[38%]" />
            <Skeleton className="h-2.5 w-[62%]" />
          </div>
          <Skeleton className="h-5 w-14 rounded-badge" />
        </div>
      ))}
    </div>
  )
}

/** 中间件不可用时的全局提示 */
export function ConnectionError({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-card border border-danger/25 bg-danger-soft p-5">
        <p className="text-[13px] font-semibold text-danger">无法读取本地数据</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{message}</p>
        <p className="mt-3 rounded-control bg-surface/60 px-2.5 py-2 font-mono text-[11.5px]">
          cd work-report &amp;&amp; pnpm dev
        </p>
      </div>
    </div>
  )
}
