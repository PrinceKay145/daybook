/* "A new version is out." The app reads one small public file — releases/latest.json in the
   project's Supabase Storage, or VITE_UPDATE_URL — and says so when it names a newer version
   than this one. Nothing installs itself: the link opens the new disk image to download.
   shortcut: a manual install; move to electron-updater once the app is signed with a
   Developer ID (macOS only lets signed apps update themselves). */

export const APP_VERSION: string = __APP_VERSION__;

export type Update = { version: string; url: string; notes?: string };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SOURCE =
  (import.meta.env.VITE_UPDATE_URL as string | undefined) ??
  (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/releases/latest.json` : undefined);

/** Whether dotted version a is newer than b ("0.1.10" > "0.1.9"; a "-beta" suffix is ignored). */
export function isNewer(a: string, b: string): boolean {
  const parts = (v: string) => v.split("-")[0].split(".").map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** The newer version on offer, or null — also when offline or the file is missing or odd. */
export async function checkForUpdate(): Promise<Update | null> {
  if (!SOURCE) return null;
  try {
    const response = await fetch(SOURCE, { cache: "no-store" });
    if (!response.ok) return null;
    const latest: unknown = await response.json();
    if (!latest || typeof latest !== "object") return null;
    const { version, url, notes } = latest as Record<string, unknown>;
    // The link is opened outside the app, so only an https download is ever offered.
    if (typeof version !== "string" || typeof url !== "string" || !url.startsWith("https://")) return null;
    return isNewer(version, APP_VERSION) ? { version, url, notes: typeof notes === "string" ? notes : undefined } : null;
  } catch {
    return null;
  }
}
