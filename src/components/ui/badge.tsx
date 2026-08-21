import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn, hueFrom } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-badge px-1.5 py-0.5 text-[11px] font-medium leading-4 ' +
    'border transition-colors [&_svg]:size-3',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-muted text-muted-foreground',
        primary: 'border-primary/20 bg-primary-soft text-primary',
        success: 'border-success/20 bg-success-soft text-success',
        warning: 'border-warning/25 bg-warning-soft text-warning',
        info: 'border-info/20 bg-info-soft text-info',
        danger: 'border-danger/20 bg-danger-soft text-danger',
        outline: 'border-border bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  ),
)
Badge.displayName = 'Badge'

/** 模块标签：颜色由标签名稳定派生，同一个模块在全站永远同色 */
export const TagChip = React.forwardRef<
  HTMLSpanElement,
  { tag: string; className?: string } & React.HTMLAttributes<HTMLSpanElement>
>(({ tag, className, ...props }, ref) => {
  const h = hueFrom(tag)
  return (
    <span
      ref={ref}
      {...props}
      className={cn(
        'inline-flex items-center rounded-badge border px-1.5 py-0.5 text-[11px] font-medium leading-4',
        className,
      )}
      style={{
        color: `hsl(${h} 62% 42%)`,
        background: `hsl(${h} 70% 96%)`,
        borderColor: `hsl(${h} 60% 88%)`,
      }}
    >
      {tag}
    </span>
  )
})
TagChip.displayName = 'TagChip'

export { badgeVariants }
