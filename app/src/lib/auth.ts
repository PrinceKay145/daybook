/* Accounts: identity and licensing only. No life data is ever sent here — the folder
   is the only place that knows anything about the user's week. */

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { daybook, isDesktop } from "@/lib/daybook";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const credentialsPresent = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/* createClient validates the URL shape, and it runs at module scope — a malformed
   value must degrade to developer mode with a visible message, never take the whole
   bundle down with it. */
let supabase: SupabaseClient | null = null;
let initError: string | null = null;
if (credentialsPresent && SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: "implicit", persistSession: true },
    });
  } catch (err) {
    initError = err instanceof Error ? err.message : String(err);
  }
}

/** True when a real, constructible client exists. False means developer mode: the
    flow runs, nothing is checked, and the UI says so. */
export const authConfigured = credentialsPresent && supabase !== null;

/** Non-null when credentials were provided but unusable (e.g. a malformed URL) —
    the login screen shows this instead of failing silently. */
export const authInitError = initError;

const DEV_KEY = "daybook.dev-account";

/** What the app needs to know about an account: an email to display. Nothing more. */
export interface Account {
  email: string;
  dev: boolean;
}

/** Auth calls have no built-in timeout. A stalled session check must never leave
    the whole app on its loading screen — it gets one chance, then we proceed. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} did not answer within ${ms / 1000}s`)), ms),
    ),
  ]);
}

function devAccount(): Account | null {
  const email = localStorage.getItem(DEV_KEY);
  return email ? { email, dev: true } : null;
}

export async function getAccount(): Promise<Account | null> {
  if (!authConfigured || !supabase) return devAccount();
  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    5000,
    "The Supabase session check",
  );
  if (error) throw new Error(error.message);
  const email = data.session?.user?.email;
  return email ? { email, dev: false } : null;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!supabase) {
    localStorage.setItem(DEV_KEY, email);
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

/** Returns a message to show when the account needs email confirmation before the
    first sign-in (empty string when the session already exists). */
export async function signUpWithPassword(email: string, password: string): Promise<string> {
  if (!supabase) {
    localStorage.setItem(DEV_KEY, email);
    return "";
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data.session ? "" : "Check your inbox — your account needs confirming before the first sign-in.";
}

/** Opens the system browser for Google consent; the OS hands daybook://auth (or the
    browser origin, in dev) back to us and handleAuthRedirect finishes the exchange. */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error("Google sign-in needs Supabase credentials — see app/README.md.");
  const redirectTo = isDesktop ? "daybook://auth" : window.location.origin;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data.url) throw new Error("Supabase did not return an authorize URL.");
  if (isDesktop) {
    await daybook.openExternal(data.url);
  } else {
    window.location.href = data.url;
  }
}

/** Completes the Google round-trip. Resolves true when the URL was a live callback. */
export async function handleAuthRedirect(rawUrl: string): Promise<boolean> {
  if (!rawUrl.startsWith("daybook://") && !rawUrl.startsWith(window.location.origin)) return false;
  const url = new URL(rawUrl);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const query = url.searchParams;

  const errorText = query.get("error_description") ?? hash.get("error_description");
  if (errorText) throw new Error(errorText);

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (!accessToken || !refreshToken || !supabase) return false;

  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw new Error(error.message);
  return true;
}

export function onAuthChange(callback: (account: Account | null) => void): () => void {
  if (!authConfigured || !supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
    const email = session?.user?.email;
    callback(email ? { email, dev: false } : null);
  });
  return () => data.subscription.unsubscribe();
}

export async function signOut(): Promise<void> {
  localStorage.removeItem(DEV_KEY);
  if (supabase) await supabase.auth.signOut();
}
