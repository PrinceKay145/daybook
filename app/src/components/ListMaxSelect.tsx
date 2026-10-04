/* The size of today's list — law 8's number, the user's to set. One control for setup and
   Settings, so both say the same thing. */

import { inputClass } from "@/components/ui/button";
import { LIST_MAX } from "@/lib/daybook";
import { cn } from "@/lib/utils";

const CHOICES = Array.from({ length: LIST_MAX.highest - LIST_MAX.lowest + 1 }, (_, i) => LIST_MAX.lowest + i);

export const LIST_MAX_HINT = "It never pads the list to reach this — a day with two real things shows two.";

export function things(count: number): string {
  return count === 1 ? "1 thing" : `${count} things`;
}

export function ListMaxSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <select className={cn(inputClass, "w-auto")} value={value} onChange={(event) => onChange(Number(event.target.value))}>
      {CHOICES.map((count) => (
        <option key={count} value={count}>
          {things(count)}
          {count === LIST_MAX.default ? " (the default)" : ""}
        </option>
      ))}
    </select>
  );
}
