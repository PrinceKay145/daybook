/* The home screen. Not a chat box.

   The brief shown here is the *same* self-contained HTML file the runner writes into the
   folder — one renderer, not two. A React copy of the seven sections would be a second
   view that drifts from the artefact the user actually opens from their folder, and the
   eleven assertions would only cover one of them. */

import { briefUrl } from "@/lib/api";
import type { Payload } from "@/types";
import { Badge } from "@/components/ui/badge";

export function BriefScreen({ payload }: { payload: Payload }) {
  const { verification, brief } = payload;

  if (!verification.passed) {
    const failed = verification.results.filter((r) => !r.ok);
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--color-warn)]/40 bg-[var(--color-surface)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-warn)]">Brief withheld</h2>
        <p className="mt-2 max-w-prose text-sm text-[var(--color-ink-soft)]">
          Verification failed, so nothing was rendered. A brief that renders wrong is worse
          than no brief — it is read quickly, trusted, and acted on.
        </p>
        <ul className="mt-4 space-y-3">
          {failed.map((r) => (
            <li key={r.id} className="text-sm">
              <span className="font-mono text-xs text-[var(--color-ink-faint)]">{r.id}</span>{" "}
              <span className="font-medium">{r.name}</span>
              <div className="text-[var(--color-ink-soft)]">{r.detail}</div>
              <div className="text-xs text-[var(--color-ink-faint)]">catches: {r.catches}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-faint)]">
        <Badge variant="pass">{verification.results.length}/{verification.results.length} verified</Badge>
        <span>
          {brief.clock_frozen ? "frozen clock" : "live clock"} · {brief.clock_description}
        </span>
        <a
          href={briefUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto underline underline-offset-2 hover:text-[var(--color-ink)]"
        >
          open the file on its own
        </a>
      </div>
      <iframe
        title={`Brief for ${brief.generated_for}`}
        src={briefUrl}
        className="h-[calc(100vh-190px)] min-h-[520px] w-full rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]"
      />
    </div>
  );
}
