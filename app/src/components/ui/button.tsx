/* shadcn/ui pattern: components are copied into the repo, not installed. */
import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-white hover:opacity-90 dark:text-[var(--color-canvas)]",
  secondary:
    "border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-ink-faint)]",
  ghost:
    "bg-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(({ className, variant = "primary", type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium",
      "transition-all focus-visible:outline-2 focus-visible:outline-offset-2",
      "focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50",
      VARIANTS[variant],
      className,
    )}
    {...props}
  />
));
Button.displayName = "Button";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-[var(--color-ink-faint)]">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] " +
  "px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] " +
  "focus:border-[var(--color-accent)] focus:outline-none";

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-[var(--color-warn)]">
      {message}
    </p>
  );
}
