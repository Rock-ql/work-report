import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

export const TooltipProvider = TooltipPrimitive.Provider

/** 简化包装：<Tip label="说明">{触发器}</Tip> */
export function Tip({
  label,
  children,
  side = 'bottom',
  className,
}: {
  label: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}) {
  if (!label) return <>{children}</>
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-50 max-w-[280px] rounded-[6px] bg-foreground px-2 py-1 text-[11.5px] leading-relaxed text-background shadow-pop',
            'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
            className,
          )}
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
