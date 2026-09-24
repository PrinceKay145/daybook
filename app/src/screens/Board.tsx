/* Everything live and waiting on another person.

   Every row carries WAIT or CHASE and a date. A row with neither is a slow leak — it looks
   tracked and is not — so V9 fails the build rather than this screen hiding it. */

import type { Payload } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function daysAway(iso: string, from: string): number | null {
  const then = Date.parse(`${iso}T00:00:00`);
  const now = Date.parse(`${from.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  return Math.round((then - now) / 86_400_000);
}

function When({ date, today }: { date: string; today: string }) {
  const away = daysAway(date, today);
  if (away === null) return <span>{date}</span>;
  const text =
    away === 0 ? "today" : away === 1 ? "tomorrow" : away > 0 ? `in ${away} days` : `${-away} days ago`;
  return (
    <span className={away < 0 ? "text-[var(--color-warn)]" : undefined}>
      {date} · {text}
    </span>
  );
}

export function BoardScreen({ payload }: { payload: Payload }) {
  const { brief } = payload;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Waiting on someone else</CardTitle>
        </CardHeader>
        <CardContent>
          {brief.board_live.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-faint)]">
              Nothing is waiting on anyone else.
            </p>
          ) : (
            <ul>
              {brief.board_live.map((row) => (
                <li
                  key={`${row.who}-${row.date}`}
                  className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-1 border-b border-[var(--color-line)] py-3 last:border-0"
                >
                  <Badge
                    variant={row.status.toUpperCase() === "WAIT" ? "wait" : "chase"}
                    className="row-span-3 self-start justify-center"
                  >
                    {row.status.toUpperCase()}
                  </Badge>
                  <span className="font-semibold">{row.who}</span>
                  <span className="text-sm text-[var(--color-ink-soft)]">{row.what}</span>
                  <span className="text-xs text-[var(--color-ink-faint)]">
                    {row.next_move} · <When date={row.date} today={brief.generated_for} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {brief.board_note && (
            <p className="mt-4 text-sm text-[var(--color-ink-soft)]">{brief.board_note}</p>
          )}
        </CardContent>
      </Card>

      {brief.board_closed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Closed, kept visible</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-[var(--color-ink-faint)]">
              {brief.board_closed.map((row) => (
                <li key={row.who}>
                  <span className="text-[var(--color-ink-soft)]">{row.who}</span> — {row.what}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {brief.not_on_list.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Not on the list, deliberately</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm text-[var(--color-ink-soft)]">
              {brief.not_on_list.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {brief.questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Open questions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm text-[var(--color-ink-soft)]">
              {brief.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
