import * as React from 'react'
import * as AlertPrimitive from '@radix-ui/react-alert-dialog'
import { cn } from '@/lib/utils'
import { Button } from './button'

/** 破坏性操作的二次确认。用法：<ConfirmDialog onConfirm={...}>{触发器}</ConfirmDialog> */
export function ConfirmDialog({
  children,
  title,
  description,
  confirmText = '确认删除',
  cancelText = '取消',
  danger = true,
  onConfirm,
}: {
  children: React.ReactNode
  title: string
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  return (
    <AlertPrimitive.Root>
      <AlertPrimitive.Trigger asChild>{children}</AlertPrimitive.Trigger>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-[400px] -translate-x-1/2 -translate-y-1/2',
            'rounded-card border border-border bg-surface-raised p-5 shadow-pop',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <AlertPrimitive.Title className="text-[15px] font-semibold tracking-tight">
            {title}
          </AlertPrimitive.Title>
          {description && (
            <AlertPrimitive.Description className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
              {description}
            </AlertPrimitive.Description>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <AlertPrimitive.Cancel asChild>
              <Button variant="secondary" size="sm">
                {cancelText}
              </Button>
            </AlertPrimitive.Cancel>
            <AlertPrimitive.Action asChild>
              <Button
                variant={danger ? 'danger' : 'primary'}
                size="sm"
                loading={busy}
                onClick={async (e) => {
                  e.preventDefault()
                  setBusy(true)
                  try {
                    await onConfirm()
                  } finally {
                    setBusy(false)
                  }
                  // Radix 需要手动关闭：模拟一次 Escape
                  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
                }}
              >
                {confirmText}
              </Button>
            </AlertPrimitive.Action>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  )
}
