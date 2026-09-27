/* The scoreboard — the drawing's home screen: daily plans, metrics, actions.
   The brief pipeline that fills it for real is the next stage; until then the data is
   sample data and says so, loudly. A placeholder that pretends to be a real brief
   would break the only promise this product makes. */

import { FolderOpen, KeyRound, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Connection } from "@/lib/daybook";

const SAMPLE_PLANS = [
  { time: "09:00 – 12:30", title: "Deep work — draft the Hartley proposal", note: "First move: open the brief and write the opening section" },
  { time: "13:30 – 16:00", title: "Client work", note: "Aldridge renewal — second prompt sent 8 March; next: yes/no" },
  { time: "19:30 – 22:00", title: "Applications", note: "Two out this week; one concrete click each" },
];

const SAMPLE_METRICS = [
  { label: "Applications sent", value: "4", note: "this week" },
  { label: "Conversations", value: "2", note: "this week" },
  { label: "Outstanding", value: "£1,850", note: "across two invoices" },
];

const SAMPLE_ACTIONS = [
  { title: "Send the Hartley proposal", detail: "Open the draft and write the first section — not 'work on Hartley'." },
  { title: "Chase Aldridge with a yes/no", detail: "Two prompts already. A no closes it as cleanly as a yes." },
];

export function ScoreboardScreen({
  accountEmail,
  folder,
  connection,
  briefTime,
  onChangeAI,
  onSignOut,
}: {
  accountEmail: string;
  folder: string;
  connection: Connection | null;
  briefTime: string;
  onChangeAI: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Daybook</h1>
          <p className="text-xs text-[var(--color-ink-faint)]">
            {accountEmail} · brief at {briefTime} ·{" "}
            <code className="text-[0.7rem]">{folder}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onChangeAI}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-ink-faint)]"
          >
            {connection?.authKind === "api_key" ? (
              <KeyRound className="size-3" />
            ) : (
              <FolderOpen className="size-3" />
            )}
            {connection
              ? `AI: ${connection.label}${connection.model ? ` · ${connection.model}` : ""} — change`
              : "AI: not connected — connect"}
          </button>
          <Button variant="ghost" onClick={onSignOut}>
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      <div className="mb-5 rounded-[var(--radius-card)] border border-[var(--color-warn)]/40 bg-[var(--color-surface)] p-4 text-sm">
        <p className="font-medium text-[var(--color-warn)]">Sample data — not your day.</p>
        <p className="mt-1 text-[var(--color-ink-soft)]">
          Your folder is connected and your brief time is set ({briefTime}). The next stage
          wires the morning brief to this screen; until then, everything below shows what it
          will look like.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Daily plans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {SAMPLE_PLANS.map((plan) => (
              <div
                key={plan.title}
                className="flex flex-wrap items-baseline gap-x-3 border-b border-[var(--color-line)] py-2 last:border-0"
              >
                <span className="w-32 shrink-0 font-mono text-xs text-[var(--color-ink-faint)]">
                  {plan.time}
                </span>
                <span className="text-sm font-medium">{plan.title}</span>
                <span className="text-xs text-[var(--color-ink-soft)]">{plan.note}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {SAMPLE_METRICS.map((metric) => (
                <div key={metric.label}>
                  <p className="text-lg font-semibold">{metric.value}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">{metric.label}</p>
                  <p className="text-[0.7rem] text-[var(--color-ink-faint)]">{metric.note}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions — today's three</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {SAMPLE_ACTIONS.map((action) => (
              <div key={action.title} className="flex gap-3">
                <Badge variant="neutral" className="mt-0.5 shrink-0">
                  click
                </Badge>
                <span className="text-sm">
                  <span className="font-medium">{action.title}</span>
                  <span className="block text-xs text-[var(--color-ink-faint)]">
                    {action.detail}
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
