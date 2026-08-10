import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { LucideLoader2, Plus } from 'lucide-react';
import { Link, LinkProps } from 'react-router';

const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm outline-0',
    'motion-breath active:scale-[0.97]',
    'disabled:pointer-events-none disabled:opacity-50 rounded border-0.5 border-transparent',
    'focus-visible:ring-1 focus-visible:ring-accent-primary focus-visible:shadow-focus',
    '[&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0',
  ),
  {
    variants: {
      variant: {
        // Solid variant series:
        // Button has its own background color, may have borders
        default:
          'bg-text-primary text-bg-base shadow-surface hover:bg-text-primary/90 hover:shadow-raised focus-visible:bg-text-primary/90',

        secondary: `
          bg-bg-card
          hover:text-text-primary hover:bg-bg-component
          focus-visible:text-text-primary focus-visible:bg-bg-component
          hover:shadow-surface
        `,

        highlighted: `
          bg-text-primary text-bg-base border-b-4 border-b-accent-primary
          hover:bg-text-primary/90 focus-visible:bg-text-primary/90
          shadow-surface hover:shadow-raised
        `,

        accent: `
          bg-accent-primary text-white
          hover:bg-accent-primary/90 focus-visible:bg-accent-primary/90
          shadow-surface hover:shadow-raised
        `,

        destructive: `
          bg-state-error text-white shadow-surface
          hover:bg-state-error/90 focus-visible:ring-state-error/20 dark:focus-visible:ring-state-error/40
          hover:shadow-raised
        `,

        // Outline variant series
        // Button has transparent or greyish background, may have borders
        outline: `
          text-text-secondary bg-bg-input border-transparent
          hover:text-text-primary hover:bg-bg-card
          focus-visible:text-text-primary focus-visible:bg-bg-card
          hover:shadow-surface
        `, // light: bg=transparent, dark: bg-input

        dashed: `
          text-text-secondary border-border-button border-dashed
          hover:text-text-primary hover:bg-bg-card
          focus-visible:text-text-primary focus-visible:bg-bg-card
          hover:shadow-surface
        `,

        icon: 'bg-transparent text-text-primary hover:bg-transparent/80',

        transparent: `
          text-text-secondary bg-transparent border-transparent
          hover:text-text-primary hover:bg-bg-card
          focus-visible:text-text-primary focus-visible:bg-bg-card
          hover:shadow-surface
        `,

        danger: `
          bg-transparent border border-state-error text-state-error
          hover:bg-state-error/10 focus-visible:bg-state-error/10
          hover:shadow-surface
        `,

        'danger-hover': `
          bg-bg-input border-border-button
          hover:bg-state-error/10 focus-visible:bg-state-error/10
          hover:text-state-error focus-visible:text-state-error
          hover:border-state-error focus-visible:border-state-error
          hover:shadow-surface
        `,

        // Ghost variant series
        // Button has transparent background, without borders
        ghost: `
          text-text-secondary
          hover:bg-bg-card focus-visible:bg-bg-card
          hover:text-text-primary focus-visible:text-text-primary
          hover:shadow-surface
        `,

        delete: `
          text-text-secondary
          hover:bg-state-error-5 hover:text-state-error
          focus-visible:text-state-error focus-visible:bg-state-error-5
          hover:shadow-surface
        `,

        link: 'text-primary underline-offset-4 hover:underline active:scale-100',

        // Static
        // Keep the label-only treatment; no elevation or press motion.
        static:
          'text-text-secondary hover:text-text-primary focus-visible:text-text-primary active:scale-100',
      },
      size: {
        auto: '',

        xl: 'h-12 rounded-2xl px-5 gap-3',
        lg: 'h-10 rounded-xl px-4',
        default: 'h-8 rounded-lg px-3',
        sm: 'h-7 rounded-lg px-2 gap-1',
        xs: 'h-6 rounded-md px-1 gap-0.5',

        'icon-xl': 'size-12 rounded-2xl',
        'icon-lg': 'size-10 rounded-xl',
        icon: 'size-8 rounded-lg',
        'icon-sm': 'size-7 rounded-lg',
        'icon-xs': 'size-6 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

export type ButtonProps<IsAnchor extends boolean = false> = {
  asChild?: boolean;
  asLink?: boolean;
  loading?: boolean;
  block?: boolean;
  disabled?: boolean;
  dot?: boolean;
} & ButtonVariants &
  (IsAnchor extends true
    ? LinkProps
    : React.ButtonHTMLAttributes<HTMLButtonElement>);

const Button = React.forwardRef(function Button<
  IsAnchor extends boolean = false,
>(
  {
    children,
    className,
    variant,
    size,
    dot = false,
    asChild = false,
    asLink = false,
    loading = false,
    disabled = false,
    block = false,
    ...props
  }: ButtonProps<IsAnchor>,
  ref: React.ForwardedRef<
    IsAnchor extends true ? HTMLAnchorElement : HTMLButtonElement
  >,
) {
  const Comp = asChild ? Slot : asLink ? Link : 'button';

  return (
    <Comp
      className={cn(
        buttonVariants({ variant, size, className }),
        { 'w-full': block },
        { relative: dot },
      )}
      // @ts-ignore
      ref={ref as React.RefObject<HTMLButtonElement | HTMLAnchorElement>}
      disabled={loading || disabled}
      {...props}
    >
      <>
        {dot && (
          <span className="absolute size-[6px] rounded-full -right-[3px] -top-[3px] bg-state-error animate" />
        )}
        {loading && <LucideLoader2 className="animate-spin" />}
        {children}
      </>
    </Comp>
  );
});

Button.displayName = 'Button';

export const ButtonLoading = Button;

ButtonLoading.displayName = 'ButtonLoading';

export { Button, buttonVariants };

export const BlockButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function BlockButton({ children, className, ...props }, ref) {
    return (
      <Button
        variant={'outline'}
        ref={ref}
        className={cn('w-full border-dashed border-input-border', className)}
        {...props}
      >
        <Plus /> {children}
      </Button>
    );
  },
);
