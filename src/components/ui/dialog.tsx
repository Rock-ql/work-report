import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]',
      'data-[state=open]:animate-in data-[state=open]:fade-in-0',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = 'DialogOverlay'

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { width?: string }
>(({ className, children, width = 'max-w-lg', ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
        width,
        'rounded-card border border-border bg-surface-raised shadow-pop',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'focus:outline-none',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute right-3 top-3 rounded-[6px] p-1 text-subtle transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
        aria-label="关闭"
      >
        <X className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
DialogContent.displayName = 'DialogContent'

/** 右侧抽屉，用于工作区编辑这类字段较多的表单 */
export const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col',
        'border-l border-border bg-surface shadow-pop',
        'data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
        'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
        'duration-200 focus:outline-none',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute right-3 top-3.5 rounded-[6px] p-1 text-subtle transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
        aria-label="关闭"
      >
        <X className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
DrawerContent.displayName = 'DrawerContent'

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-border px-5 py-4', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 border-t border-border px-5 py-3.5', className)}
      {...props}
    />
  )
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-[15px] font-semibold tracking-tight', className)}
    {...props}
  />
))
DialogTitle.displayName = 'DialogTitle'

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('mt-1 text-[12.5px] leading-relaxed text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = 'DialogDescription'
