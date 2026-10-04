/* Login / Sign-up. Identity only — the screen says what the account is for and what it
   is not for, because "why does a file app need a login?" deserves a straight answer.
   Two columns: the brand on the left (the app's one big wordmark), the form on the right. */

import { useState } from "react";
import {
  verifyAccount,
  authConfigured,
  authInitError,
  signInWithPassword,
  signUpWithPassword,
  signInWithGoogle,
  type Account,
} from "@/lib/auth";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui/button";
import { Mark } from "@/components/Logo";

export function LoginScreen({
  onSignedIn,
  authNotice,
}: {
  onSignedIn: (account: Account) => void;
  /** Why the user is here again (e.g. the account was deleted), shown above the form. */
  authNotice?: string | null;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function finish() {
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      const { account } = await verifyAccount();
      if (!account) throw new Error("Signed in, but no account came back. Try again.");
      onSignedIn(account);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!email.trim() || !password) {
      setError("Email and password are both needed.");
      return;
    }
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const message = await signUpWithPassword(email.trim(), password);
        if (message) {
          setNotice(message);
          return;
        }
      } else {
        await signInWithPassword(email.trim(), password);
      }
      await finish();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function finishOnGoogle() {
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
      /* Desktop: the browser round-trips via daybook://auth and App receives the
         callback. Browser dev: the page navigates away. Nothing to await here. */
      setWaiting(true);
      setBusy(false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const note = "rounded-[var(--radius-control)] border px-3 py-2 text-[12.5px]";
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[1.1fr_1fr]">
      {/* The one brand moment: the mark, the name, and what the product is. */}
      <section className="flex flex-col justify-between gap-10 border-b border-[var(--color-line)] px-10 py-12 md:border-b-0 md:border-r md:px-14 md:py-14">
        <div>
          <Mark className="size-14" />
          <h1 className="mt-7 font-display text-[60px] leading-none font-medium tracking-[-0.03em]">Daybook</h1>
          <p className="mt-4 max-w-[30ch] text-[17px] text-[var(--color-ink-soft)]">
            Your day, planned each morning from a folder you own.
          </p>
        </div>
        <p className="max-w-[42ch] text-[12.5px] text-[var(--color-ink-faint)]">
          The account only knows who you are. Your files stay in your folder on this Mac, and it
          never sees them.
        </p>
      </section>

      <section className="flex flex-col justify-center px-10 py-12 md:px-16">
        <div className="mx-auto w-full max-w-sm space-y-4">
          <h2 className="font-display text-[26px] font-medium tracking-[-0.01em]">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h2>

          {notice === null && authNotice && (
            <p className={`${note} border-[var(--color-warn)]/40 text-[var(--color-warn)]`}>{authNotice}</p>
          )}
          {authInitError && (
            <p className={`${note} border-[var(--color-warn)]/40 text-[var(--color-warn)]`}>
              The Supabase credentials in <code>.env</code> were rejected: {authInitError}. The
              URL should look like <code>https://…​.supabase.co</code>. Fix it and restart.
            </p>
          )}
          {!authConfigured && !authInitError && (
            <p className={`${note} border-[var(--color-warn)]/40 text-[var(--color-warn)]`}>
              Developer mode — no Supabase credentials configured, so nothing is checked.
              Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see
              app/README.md) to enable real sign-in.
            </p>
          )}

          <Button variant="secondary" size="lg" className="w-full" disabled={busy} onClick={() => void finishOnGoogle()}>
            Continue with Google
          </Button>

          {waiting && (
            <p className={`${note} border-[var(--color-line)] text-[var(--color-ink-soft)]`}>
              Google is open in your browser. After you approve, this window continues on its own.
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-[var(--color-ink-faint)]">
            <span className="h-px flex-1 bg-[var(--color-line)]" />
            or with email
            <span className="h-px flex-1 bg-[var(--color-line)]" />
          </div>

          <form
            className="space-y-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Field label="Email">
              <input
                id="login-email"
                className={inputClass}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="e.g. you@example.com"
              />
            </Field>
            <Field label="Password" hint={mode === "signup" ? "At least 6 characters." : undefined}>
              <input
                id="login-password"
                className={inputClass}
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "signup" ? "Choose a password" : "Your password"}
              />
            </Field>

            <ErrorNote message={error} />
            {notice && <p className="text-[13px] text-[var(--color-ink-soft)]">{notice}</p>}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="text-center text-[13px] text-[var(--color-ink-soft)]">
            {mode === "signin" ? "New here? " : "Already have an account? "}
            <button
              type="button"
              className="text-[var(--color-accent)] underline decoration-1 underline-offset-[3px]"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
              }}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
