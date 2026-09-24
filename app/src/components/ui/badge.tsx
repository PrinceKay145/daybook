import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva(
  "inline-flex items-center rounded-full font-bold tracking-[0.07em] text-[0.6rem] px-2 py-[3px]",
  {
    variants: {
      variant: {
        wait: "bg-[var(--color-wait)] text-white",
        chase: "bg-[var(--color-chase)] text-white",
        neutral:
          "border border-[var(--color-line)] text-[var(--color-ink-faint)] font-medium",
        pass: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
        fail: "bg-red-600/15 text-red-700 dark:text-red-400",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badge({ variant }), className)} {...props} />
);
