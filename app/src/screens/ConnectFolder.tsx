/* Connect a folder — the secretary's whole world. One picker, the folder it chose, one
   confirmation, and a plain statement of what the folder is about to hold. */

import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { daybook } from "@/lib/daybook";
import { Button, ErrorNote } from "@/components/ui/button";
import { OnboardingFrame } from "@/components/OnboardingFrame";

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

  const name = folder ? folder.split("/").filter(Boolean).pop() : null;
  return (
    <OnboardingFrame
      step={1}
      title="Choose a folder for your secretary"
      intro="Everything it knows about your life lives here as plain files you can open, edit and back up. It reads and writes nothing outside it."
    >
      <div className="max-w-xl space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="lg" disabled={busy} onClick={() => void pick()}>
            <FolderOpen />
            {folder ? "Choose another folder" : "Choose a folder"}
          </Button>
          {folder && (
            <p className="min-w-0 text-[13px]">
              <span className="font-semibold">{name}</span>
              <span className="block truncate font-mono text-[12px] text-[var(--color-ink-faint)]" title={folder}>{folder}</span>
            </p>
          )}
        </div>

        <ErrorNote message={error} />

        <Button size="lg" disabled={!folder || busy} onClick={() => folder && onConnected(folder)}>
          Use this folder
        </Button>

        <p className="max-w-[58ch] border-t border-[var(--color-line)] pt-4 text-[12.5px] text-[var(--color-ink-faint)]">
          A folder that syncs, like iCloud Drive or Dropbox, is fine for your files. A new, empty
          folder is the easiest start.
        </p>
      </div>
    </OnboardingFrame>
  );
}
