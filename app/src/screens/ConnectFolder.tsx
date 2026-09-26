/* Connect a folder — the secretary's whole world. One picker, one confirmation, and a
   plain statement of what the folder is about to hold. */

import { useState } from "react";
import { FolderOpen, Check } from "lucide-react";
import { daybook } from "@/lib/daybook";
import { Button, ErrorNote } from "@/components/ui/button";

export function ConnectFolderScreen({
  initialFolder,
  onConnected,
}: {
  initialFolder?: string;
  onConnected: (folder: string) => void;
}) {
  const [folder, setFolder] = useState<string | null>(initialFolder ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    setBusy(true);
    try {
      const picked = await daybook.pickFolder();
      if (picked) setFolder(picked);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
      <div className="mb-6">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">
          Step 1 of 3
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Connect a folder</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          This folder is your secretary's whole world — everything it knows about your week
          lives here as plain files you can open, edit and back up. It reads and writes
          nothing outside it.
        </p>
      </div>

      <div className="space-y-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void pick()}>
          <FolderOpen className="size-4" />
          {folder ? "Choose a different folder" : "Choose a folder"}
        </Button>

        {folder && (
          <p className="flex items-start gap-2 rounded-[var(--radius-card)] border border-[var(--color-line)] px-3 py-2 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-accent)]" />
            <code className="break-all">{folder}</code>
          </p>
        )}

        <ErrorNote message={error} />

        <Button
          className="w-full"
          disabled={!folder || busy}
          onClick={() => folder && onConnected(folder)}
        >
          Use this folder
        </Button>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--color-ink-faint)]">
        A folder that syncs (iCloud, Dropbox) will warn later — sync services and databases
        do not mix. Your documents themselves are safe there; it is Daybook's own index that
        must live elsewhere.
      </p>
    </div>
  );
}
