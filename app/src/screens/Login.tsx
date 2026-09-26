/* Login / Sign-up. Identity only — the screen says what the account is for and what it
   is not for, because "why does a file app need a login?" deserves a straight answer. */

import { useState } from "react";
import {
  getAccount,
  authConfigured,
  authInitError,
  signInWithPassword,
  signUpWithPassword,
  signInWithGoogle,
  type Account,
} from "@/lib/auth";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui/button";

export function LoginScreen({
  onSignedIn,
}: {
  onSignedIn: (account: Account) => void;
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
      const account = await getAccount();
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

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Daybook</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Your chief of staff. It holds your week in a folder you own, wakes up on its own,
          and is built so it cannot state something false about your day.
        </p>
      </div>

      <div className="space-y-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
        {authInitError && (
          <p className="rounded-[var(--radius-card)] border border-[var(--color-warn)]/40 px-3 py-2 text-xs text-[var(--color-warn)]">
            The Supabase credentials in <code>.env</code> were rejected: {authInitError}. The
            URL should look like <code>https://…​.supabase.co</code>. Fix it and restart.
          </p>
        )}

        {!authConfigured && !authInitError && (
          <p className="rounded-[var(--radius-card)] border border-[var(--color-warn)]/40 px-3 py-2 text-xs text-[var(--color-warn)]">
            Developer mode — no Supabase credentials configured, so nothing is checked.
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see
            app/README.md) to enable real sign-in.
          </p>
        )}

        <Button className="w-full" disabled={busy} onClick={() => void finishOnGoogle()}>
          Continue with Google
        </Button>

        {waiting && (
          <p className="rounded-[var(--radius-card)] border border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
            Google is open in your browser. After you approve, the browser may ask
            permission to hand the link back to Daybook — allow it. This window continues
            on its own the moment the link arrives.
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-[var(--color-ink-faint)]">
          <span className="h-px flex-1 bg-[var(--color-line)]" />
          or with email
          <span className="h-px flex-1 bg-[var(--color-line)]" />
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field
            label="Password"
            hint={mode === "signup" ? "At least 6 characters." : undefined}
          >
            <input
              className={inputClass}
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </Field>

          <ErrorNote message={error} />
          {notice && <p className="text-sm text-[var(--color-ink-soft)]">{notice}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          className="w-full text-center text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
        >
          {mode === "signin"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--color-ink-faint)]">
        The account is for identity and licensing only. Your files stay in your folder on
        this Mac — the account never sees them.
      </p>
    </div>
  );
}
