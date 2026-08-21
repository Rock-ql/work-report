import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-8.5 w-full rounded-control border border-input bg-surface px-2.5 text-[13px]',
        'placeholder:text-subtle transition-colors',
        'focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-control border border-input bg-surface px-2.5 py-2 text-[13px] leading-relaxed',
      'placeholder:text-subtle transition-colors resize-y',
      'focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('block text-[12px] font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}

/** 表单字段：标签 + 控件 + 说明/错误 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string
  hint?: React.ReactNode
  error?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[11.5px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[11.5px] text-subtle">{hint}</p>
      ) : null}
    </div>
  )
}
