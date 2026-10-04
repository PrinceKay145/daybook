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

/* A form field reads in three weights, strongest first: the question (full ink), the
   guidance (soft, read before typing, so it sits above the input), and the input itself.
   An example can live in the placeholder, drawn so it never passes for an answer: italic
   and faint, where a real answer is upright full ink — and "e.g." on a one-line field. */
export function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-[var(--color-ink)]">
        {label}
        {optional && <span className="ml-1.5 font-normal text-[var(--color-ink-faint)]">(optional)</span>}
      </span>
      {hint && <span className="mt-0.5 block text-xs text-[var(--color-ink-soft)]">{hint}</span>}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

/* Inputs sit recessed in the canvas colour so they read as places to type, not as more
   card; placeholders are italic and faint so an example never looks typed in. */
export const inputClass =
  "w-full rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-canvas)] " +
  "px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] placeholder:italic " +
  "focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/25 " +
  "disabled:opacity-60";

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-[var(--color-warn)]">
      {message}
    </p>
  );
}
