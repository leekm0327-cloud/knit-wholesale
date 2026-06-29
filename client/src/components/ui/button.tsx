import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';

import { cn } from "@/lib/utils"

// 본 브랜드 사이트 버튼 어휘:
//  default  = 검정 필(pill) — 큰 CTA·submit·shop now (rounded-full)
//  outline  = 흰 배경 + 검정 1px 보더 + 사각(rounded-none) — 보조 액션
//  secondary= 옅은 회색 채움 + 사각
//  ghost    = 텍스트 버튼
// 그림자는 쓰지 않음. UI 라벨은 Quicksand(font-ui).
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-ui text-sm font-semibold tracking-wide focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
  " hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
          "rounded-full bg-primary text-primary-foreground",
        destructive:
          "rounded-none bg-destructive text-destructive-foreground",
        outline:
          "rounded-none border [border-color:hsl(var(--button-outline))] bg-background text-foreground",
        secondary: "rounded-none border border-border bg-secondary text-secondary-foreground",
        // Add a transparent border so that when someone toggles a border on later, it doesn't shift layout/size.
        ghost: "rounded-none border border-transparent text-foreground",
      },
      size: {
        default: "min-h-9 px-5 py-2",
        sm: "min-h-8 px-3.5 text-xs",
        lg: "min-h-11 px-8",
        icon: "h-9 w-9 rounded-none",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
