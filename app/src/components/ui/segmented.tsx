/* Two small controls copied in rather than installed, like the rest of ui/.

   Segmented — a choice among a few words ("System · Light · Dark"): a sunken track, the
   chosen word raised on the surface. Switch — on or off, for one thing that runs or
   doesn't, labelled by the sentence beside it. */

import { cn } from "@/lib/utils";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  /** What the choice is about, for screen readers. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-[7px] bg-[var(--color-sunken)] p-[3px]" role="radiogroup" aria-label={label}>
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          disabled={disabled}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-[5px] px-3 py-1.5 text-[13px] transition-colors disabled:opacity-45",
            value === option
              ? "bg-[var(--color-surface)] font-semibold text-[var(--color-ink)] shadow-[0_0_0_1px_var(--color-line)]"
              : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  id,
  labelledBy,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  /** The id of the sentence that says what this turns on. */
  labelledBy?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors disabled:opacity-45",
        checked ? "bg-[var(--color-accent)]" : "bg-[var(--color-sunken)] shadow-[inset_0_0_0_1px_var(--color-line)]",
      )}
    >
      <span
        className={cn(
          "inline-block size-[18px] rounded-full bg-[var(--color-surface)] shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}
