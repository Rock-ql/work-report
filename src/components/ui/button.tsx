import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control text-[13px] font-medium ' +
    'transition-all duration-150 select-none ' +
    'disabled:pointer-events-none disabled:opacity-45 ' +
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:bg-primary-hover active:scale-[0.985]',
        secondary:
          'bg-surface text-foreground border border-border shadow-card hover:bg-muted active:scale-[0.985]',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        soft: 'bg-primary-soft text-primary hover:bg-primary/15',
        danger: 'bg-danger text-white hover:brightness-110 active:scale-[0.985]',
        'danger-ghost': 'text-danger hover:bg-danger-soft',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 px-2.5 [&_svg]:size-3.5',
        md: 'h-8.5 px-3 [&_svg]:size-4',
        lg: 'h-10 px-4 text-sm [&_svg]:size-4',
        // icon 与 md 等高、icon-sm 与 sm 等高，混排时才不会差 2px
        icon: 'h-8.5 w-8.5 [&_svg]:size-4',
        'icon-sm': 'h-7 w-7 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
