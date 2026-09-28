/* Accounts: identity and licensing only. No life data is ever sent here — the folder
   is the only place that knows anything about the user's week. */

import {
  createClient,
  isAuthApiError,
  isAuthRetryableFetchError,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { daybook, isDesktop } from "@/lib/daybook";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const credentialsPresent = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/* Named explicitly so a sign-out that cannot reach the server can still clear it —
   the client's own sign-out keeps the session when its server call fails. */
const SESSION_KEY = "daybook.session";

/* createClient validates the URL shape, and it runs at module scope — a malformed
   value must degrade to developer mode with a visible message, never take the whole
   bundle down with it. */
let supabase: SupabaseClient | null = null;
let initError: string | null = null;
if (credentialsPresent && SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: "implicit", persistSession: true, storageKey: SESSION_KEY },
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

/** What the app knows about an account. `id` is the identity everything on this Mac
    is keyed by — Supabase's user id, which a deleted-and-recreated account does not
    share with its predecessor. The email is for display only. */
export interface Account {
  id: string;
  email: string;
  dev: boolean;
}

/** Why the last session check ended signed out, when the reason is worth saying. */
export type SignedOutReason = "account-gone" | null;

/** Auth calls have no built-in timeout. A stalled check must never leave the whole
    app on its loading screen — it gets one chance, then we proceed. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} did not answer within ${ms / 1000}s`)), ms),
    ),
  ]);
}

function toAccount(user: Pick<User, "id" | "email"> | null | undefined): Account | null {
  return user?.id && user.email ? { id: user.id, email: user.email, dev: false } : null;
}

function devAccount(): Account | null {
  const email = localStorage.getItem(DEV_KEY);
  return email ? { id: `dev-${email}`, email, dev: true } : null;
}

/** The user in the session saved on this Mac, read without the network. */
function storedUser(): Account | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? toAccount((JSON.parse(raw) as { user?: User }).user) : null;
  } catch {
    return null;
  }
}

/** The server said the session or its user no longer exists (deleted, revoked). */
function accountGone(error: unknown): boolean {
  return isAuthApiError(error) && [401, 403, 404].includes(error.status);
}

/** The server could not be asked — offline, timed out, or failing on its side. */
function unreachable(error: unknown): boolean {
  return (
    isAuthRetryableFetchError(error) ||
    (isAuthApiError(error) && (error.status >= 500 || error.status === 429)) ||
    (error instanceof Error && /did not answer/.test(error.message))
  );
}

/** The session check every launch and every sign-in path runs. A saved session is
    only believed once Supabase confirms its user still exists; when Supabase cannot
    be reached, the saved session stands, because the app must open offline. */
export async function verifyAccount(): Promise<{ account: Account | null; reason: SignedOutReason }> {
  if (!authConfigured || !supabase) return { account: devAccount(), reason: null };

  let session: Session | null = null;
  try {
    const { data, error } = await withTimeout(
      supabase.auth.getSession(),
      5000,
      "The Supabase session check",
    );
    if (error) {
      if (unreachable(error)) return { account: storedUser(), reason: null };
      console.warn("[daybook] session check: saved session unusable:", error.message);
      await signOut();
      return { account: null, reason: "account-gone" };
    }
    session = data.session;
  } catch (err) {
    if (unreachable(err)) return { account: storedUser(), reason: null };
    throw err;
  }
  if (!session) return { account: null, reason: null };

  try {
    const { data, error } = await withTimeout(
      supabase.auth.getUser(),
      5000,
      "The Supabase account check",
    );
    if (!error) return { account: toAccount(data.user), reason: null };
    if (accountGone(error)) {
      console.warn(`[daybook] account check: the server no longer knows this account (${error.message})`);
      await signOut();
      return { account: null, reason: "account-gone" };
    }
    if (unreachable(error)) {
      console.warn("[daybook] account check: server unreachable — trusting the saved session");
      return { account: toAccount(session.user), reason: null };
    }
    throw new Error(error.message);
  } catch (err) {
    if (unreachable(err)) return { account: toAccount(session.user), reason: null };
    throw err;
  }
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!supabase) {
    localStorage.setItem(DEV_KEY, email);
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) {
      throw new Error(
        "That email and password didn't match. If this account usually signs in with Google, use Continue with Google instead.",
      );
    }
    throw new Error(error.message);
  }
}

/* Where Supabase sends the browser after Google consent or the confirmation email:
   back into the app on the desktop, back to this page in a browser tab. Without it
   the confirmation link lands on the project's Site URL — a browser tab running its
   own copy of the app, signed in, while the desktop app never hears about it. */
function authRedirect(): string {
  return isDesktop ? "daybook://auth" : window.location.origin;
}

/** Returns a message to show when the account needs email confirmation before the
    first sign-in (empty string when the session already exists). */
export async function signUpWithPassword(email: string, password: string): Promise<string> {
  if (!supabase) {
    localStorage.setItem(DEV_KEY, email);
    return "";
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirect() },
  });
  if (error) {
    // One human, one account: an email that already exists (by password or via a
    // linked Google identity) must never silently become a second identity.
    if (/already registered|already exists/i.test(error.message)) {
      throw new Error(
        "An account with this email already exists. Sign in instead — or, if you created it with Google, use Continue with Google.",
      );
    }
    throw new Error(error.message);
  }
  return data.session
    ? ""
    : isDesktop
      ? "Check your inbox and open the confirmation link on this Mac — it brings you straight back to Daybook."
      : "Check your inbox — your account needs confirming before the first sign-in.";
}

/** Opens the system browser for Google consent; the OS hands daybook://auth (or the
    browser origin, in dev) back to us and handleAuthRedirect finishes the exchange. */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error("Google sign-in needs Supabase credentials — see app/README.md.");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: authRedirect(), skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data.url) throw new Error("Supabase did not return an authorize URL.");
  if (isDesktop) {
    await daybook.openExternal(data.url);
  } else {
    window.location.href = data.url;
  }
}

/** Completes a browser round-trip (Google consent or the confirmation email).
    Resolves true when the URL was a live callback. */
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

/** Fires when the session ends out from under the app (signed out elsewhere, or a
    refresh the server refused). Sign-ins are routed by the paths that start them,
    each of which verifies first — so this never lets an unverified session in. */
export function onSignedOut(callback: () => void): () => void {
  if (!authConfigured || !supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") callback();
  });
  return () => data.subscription.unsubscribe();
}

/** Always ends signed out on this Mac. The server is told when it can be reached;
    when it cannot, the saved session is cleared here anyway — signing out must never
    depend on the network. */
export async function signOut(): Promise<void> {
  localStorage.removeItem(DEV_KEY);
  if (!supabase) return;
  try {
    const { error } = await withTimeout(supabase.auth.signOut(), 5000, "Supabase sign-out");
    if (error) throw error;
  } catch (err) {
    console.warn("[daybook] sign-out: server not told, clearing this Mac's session:", err);
    localStorage.removeItem(SESSION_KEY);
  }
}
