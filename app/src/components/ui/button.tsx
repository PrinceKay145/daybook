/* shadcn/ui pattern: components are copied into the repo, not installed. */
import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

/* One primary per screen. Secondary is outlined; ghost is text. A disabled button keeps its
   shape and dims, so it reads as waiting rather than broken. */
const VARIANTS: Record<Variant, string> = {
  primary:
    "border border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-ink)] hover:brightness-110",
  secondary:
    "border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-ink-faint)]",
  ghost:
    "border border-transparent bg-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
};

const SIZES: Record<Size, string> = {
  md: "h-8 px-3 text-[13px]",
  lg: "h-10 px-4 text-sm",
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] font-medium",
      "transition-[color,border-color,filter,opacity] duration-150",
      "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100",
      "[&_svg]:size-[15px] [&_svg]:shrink-0",
      SIZES[size],
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
      <span className="block text-[13.5px] font-semibold text-[var(--color-ink)]">
        {label}
        {optional && <span className="ml-1.5 font-normal text-[var(--color-ink-faint)]">(optional)</span>}
      </span>
      {hint && <span className="mt-0.5 block text-[12.5px] text-[var(--color-ink-soft)]">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

/* Inputs are the surface colour on the paper ground, with a line border, so they read as
   places to type; placeholders are italic and faint so an example never looks typed in. */
export const inputClass =
  "w-full rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] " +
  "px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] placeholder:italic " +
  "focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 " +
  "disabled:opacity-60";

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[13px] text-[var(--color-warn)]">
      {message}
    </p>
  );
}

/* A section's name — the tracked uppercase label (the `label` utility). */
export function SectionLabel({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("label", className)} {...props} />;
}
