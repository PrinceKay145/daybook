/* The frame every onboarding step shares: the wordmark and the three steps on the left —
   each finished step says what was chosen — and the step itself on the right. A step that
   needs a sticky action bar passes it as `footer`. */

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { cn } from "@/lib/utils";

const STEPS = ["Folder", "Model", "About you"] as const;

export function OnboardingFrame({
  step,
  chosen = {},
  title,
  intro,
  footer,
  children,
}: {
  step: 1 | 2 | 3;
  /** What each finished step chose, shown under its name. */
  chosen?: { folder?: string; model?: string };
  title: string;
  intro?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const details = [chosen.folder, chosen.model, undefined];
  return (
    <div className="flex h-screen">
      <aside className="hidden w-[230px] shrink-0 flex-col gap-8 border-r border-[var(--color-line)] px-6 py-6 md:flex">
        <Wordmark />
        <ol className="grid gap-4" aria-label="Setting up Daybook">
          {STEPS.map((name, index) => {
            const n = index + 1;
            const done = n < step;
            const current = n === step;
            return (
              <li key={name} aria-current={current ? "step" : undefined}
                className={cn("grid grid-cols-[22px_1fr] gap-x-2.5 text-[13px]",
                  current ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-ink-faint)]")}>
                <span className={cn("grid size-5 place-items-center rounded-full border text-[11px] tnum",
                  done && "border-[var(--color-line)] bg-[var(--color-sunken)] text-[var(--color-ink-soft)]",
                  current && "border-[var(--color-accent)] text-[var(--color-accent)]",
                  !done && !current && "border-[var(--color-line)]")}>
                  {done ? <Check className="size-3" strokeWidth={2.6} /> : n}
                </span>
                <span className="min-w-0">
                  {name}
                  {done && details[index] && (
                    <span className="block truncate font-normal text-[var(--color-ink-faint)]" title={details[index]}>
                      {details[index]}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-8 py-8 md:px-11">
          <p className="label md:hidden">Step {step} of 3</p>
          <h1 className="font-display text-[32px] leading-[1.1] font-medium tracking-[-0.015em]">{title}</h1>
          {intro && <div className="mt-2 max-w-[60ch] text-[14.5px] text-[var(--color-ink-soft)]">{intro}</div>}
          <div className="mt-7">{children}</div>
        </div>
        {footer && (
          <div className="flex shrink-0 items-center justify-between gap-4 border-t border-[var(--color-line)] px-8 py-2.5 text-[12.5px] text-[var(--color-ink-soft)] md:px-11">
            {footer}
          </div>
        )}
      </main>
    </div>
  );
}

/* The same frame for a page outside onboarding (changing the model later): the wordmark
   and a way back, then the page. */
export function PageFrame({ back, title, intro, children }: {
  back?: ReactNode;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-[var(--color-line)] px-5">
        <Wordmark />
        <span className="ml-auto">{back}</span>
      </header>
      <main className="flex-1 overflow-y-auto px-8 py-8 md:px-11">
        <div className="max-w-3xl">
          <h1 className="font-display text-[32px] leading-[1.1] font-medium tracking-[-0.015em]">{title}</h1>
          {intro && <div className="mt-2 max-w-[60ch] text-[14.5px] text-[var(--color-ink-soft)]">{intro}</div>}
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
