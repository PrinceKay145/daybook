/* The Daybook mark — the day as a dial: a ring for the 24 hours, the planned part of the day
   in ink blue, and a short hand. The same geometry as brand/daybook-mark.svg, drawn here
   from the theme's tokens so it follows light and dark. */

import { cn } from "@/lib/utils";

export function Mark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5 shrink-0", className)} role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true} aria-label={title}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--color-line)" strokeWidth="2.4" />
      <path d="M12 3 A9 9 0 0 1 20.2 15.7" fill="none" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12 12 L15.6 7.6" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.7" fill="var(--color-ink)" />
    </svg>
  );
}

/* The mark with the name set in Newsreader — the app's one brand moment per screen. */
export function Wordmark({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("inline-flex items-center", size === "lg" ? "gap-3" : "gap-2", className)}>
      <Mark className={size === "lg" ? "size-9" : "size-5"} />
      <span className={cn("font-display font-semibold tracking-[-0.01em] text-[var(--color-ink)]",
        size === "lg" ? "text-[30px]" : "text-[19px]")}>
        Daybook
      </span>
    </span>
  );
}
