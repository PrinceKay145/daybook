/* Read-only in week 1 — the write path is week 2, and a settings screen that pretends to
   save is worse than one that says it cannot.

   The scope is shown because it has to be visible: a secretary that can read the whole
   disk is a very different proposition from one that can read one folder, and the second
   is the one people will hand their life to. */

import type { Payload } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-line)] py-2 text-sm last:border-0">
      <span className="text-[var(--color-ink-soft)]">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function SettingsScreen({ payload }: { payload: Payload }) {
  const { brief, diagnostics, verification } = payload;
  const hb = diagnostics.heartbeat as Record<string, string | number | boolean>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>The folder</CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Location">
            <code className="text-xs">{payload.folder}</code>
          </Row>
          <Row label="Referred to in files as">
            <code className="text-xs">{payload.scopeRoot}</code>
          </Row>
          <Row label="Reach">
            {diagnostics.scope.allow_outside_root ? (
              <Badge variant="fail">outside the folder is allowed</Badge>
            ) : (
              <Badge variant="pass">this folder only</Badge>
            )}
          </Row>
          <Row label="Shell actions">
            {diagnostics.scope.shell_actions_enabled ? (
              <Badge variant="fail">enabled</Badge>
            ) : (
              <Badge variant="pass">disabled</Badge>
            )}
          </Row>
          <Row label="Clock">
            {brief.clock_description}
          </Row>
          <Row label="Timezone">{brief.timezone}</Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verification — the eleven</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
            Run against the brief's data before it is delivered. Nothing is written or shown
            unless all eleven pass.
          </p>
          <ul className="space-y-2">
            {verification.results.map((r) => (
              <li key={r.id} className="flex gap-3 text-sm">
                <Badge variant={r.ok ? "pass" : "fail"} className="shrink-0">
                  {r.id}
                </Badge>
                <span>
                  <span className="font-medium">{r.name}</span>
                  <span className="block text-xs text-[var(--color-ink-faint)]">{r.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery</CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Heartbeat">
            {hb.present ? <Badge variant="pass">present</Badge> : <Badge variant="fail">missing</Badge>}
          </Row>
          <Row label="Last tick">{String(hb.last_tick ?? "—")}</Row>
          <Row label="Total fired">{String(hb.total_fired ?? "—")}</Row>
          <Row label="Alert style">
            {brief.delivery.buttons_reachable ? (
              <Badge variant="pass">{String(hb.alert_style)} — buttons reachable</Badge>
            ) : (
              <Badge variant="fail">{String(hb.alert_style)} — buttons NOT reachable</Badge>
            )}
          </Row>
          <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
            {brief.delivery.undelivered_days.length > 0
              ? `Undelivered: ${brief.delivery.undelivered_days.join(", ")}. Those days are a system failure, not the user's.`
              : "No undelivered days in the last week."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI provider</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
            Not wired up until week 3. <code className="text-xs">authKind</code> is data on
            each record, never an assumption — the provider surface moved three times in 2026.
          </p>
          {diagnostics.providers.map((p) => (
            <Row key={p.id} label={p.label}>
              <code className="mr-2 text-xs text-[var(--color-ink-faint)]">{p.authKind}</code>
              <Badge variant="neutral">{p.detected ? "detected" : "not detected"}</Badge>
            </Row>
          ))}
        </CardContent>
      </Card>

      {diagnostics.invalidMutes.length > 0 && (
        <Card className="border-[var(--color-warn)]/40">
          <CardHeader>
            <CardTitle className="text-[var(--color-warn)]">Invalid mutes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
              A mute requires a dated companion action that performs the un-mute, or it is not
              a mute — it is a deletion with extra steps. Nothing in the system will turn these
              back on.
            </p>
            <ul className="space-y-1 text-sm">
              {diagnostics.invalidMutes.map((m) => (
                <li key={m.id}>
                  <code className="text-xs">{m.id}</code> — {m.title}
                  {m.pausedOn && (
                    <span className="text-[var(--color-ink-faint)]"> · off since {m.pausedOn}</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Referenced paths</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-xs">
            {brief.references.map((r) => (
              <li key={`${r.where}-${r.recorded}`} className="flex gap-2">
                <Badge variant={r.exists || r.pending ? "pass" : "fail"} className="shrink-0">
                  {r.exists ? "ok" : r.pending ? "pending" : "missing"}
                </Badge>
                <code className="break-all">{r.recorded}</code>
                <span className="ml-auto shrink-0 text-[var(--color-ink-faint)]">{r.where}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
