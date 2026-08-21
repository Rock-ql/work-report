import * as React from 'react'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

export const Dropdown = DropdownPrimitive.Root
export const DropdownTrigger = DropdownPrimitive.Trigger

export const DropdownContent = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(({ className, sideOffset = 5, ...props }, ref) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[9rem] overflow-hidden rounded-control border border-border bg-surface-raised p-1 shadow-pop',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        className,
      )}
      {...props}
    />
  </DropdownPrimitive.Portal>
))
DropdownContent.displayName = 'DropdownContent'

export const DropdownItem = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { danger?: boolean }
>(({ className, danger, ...props }, ref) => (
  <DropdownPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2 py-1.5 text-[13px]',
      'outline-none transition-colors data-[highlighted]:bg-muted',
      '[&_svg]:size-3.5 [&_svg]:text-subtle',
      danger && 'text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger',
      className,
    )}
    {...props}
  />
))
DropdownItem.displayName = 'DropdownItem'

export function DropdownSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-border" />
}

export function DropdownLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <DropdownPrimitive.Label
      className={cn('px-2 py-1.5 text-[11px] font-medium text-subtle', className)}
      {...props}
    />
  )
}
