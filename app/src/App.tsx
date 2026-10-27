/* The v1 flow, from the owner's drawing: login → connect a folder → connect an AI
   provider → setup questions → scoreboard. Subsequent launches go straight to the
   scoreboard. Each account's folder choice and connections live in app data under its
   user id, the answers live in the user's folder, and the account holds an email —
   nothing else. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  handleAuthRedirect,
  onSignedOut,
  savedAccount,
  signOut,
  verifyAccount,
  type Account,
} from "@/lib/auth";
import { daybook, isDesktop, type Connection, type UserSettings } from "@/lib/daybook";
import { LoginScreen } from "@/screens/Login";
import { ConnectFolderScreen } from "@/screens/ConnectFolder";
import { ConnectProviderScreen } from "@/screens/ConnectProvider";
import { SetupQuestionsScreen } from "@/screens/SetupQuestions";
import { ScoreboardScreen } from "@/screens/Scoreboard";
import { SettingsScreen } from "@/screens/Settings";

type Stage = "loading" | "login" | "folder" | "provider" | "setup" | "home" | "settings";

const ACCOUNT_GONE_NOTICE =
  "Your sign-in on this Mac has ended: the account was deleted or signed out elsewhere. Sign in, or create a new account.";

/* The one place that decides the screen. It sees only a verified account and that
   account's own record, so another account's progress — or a deleted account's, under
   the same email — can never skip a step. */
function decideStage(account: Account | null, settings: UserSettings): Stage {
  if (!account) return "login";
  if (!settings.folderPath) return "folder";
  if (!settings.connections?.length) return "provider";
  if (!settings.setupCompletedAt) return "setup";
  return "home";
}

export default function App() {
  const [stage, setStage] = useState<Stage>("loading");
  const [account, setAccount] = useState<Account | null>(null);
  const [settings, setSettings] = useState<UserSettings>({});
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  // Set when setup has just finished, so the scoreboard plans the first day straight away.
  const [planOnArrival, setPlanOnArrival] = useState(false);

  // Launch, sign-in, the browser callback and sign-out can overlap; each routing takes
  // a ticket when it starts, and only the newest one lands.
  const ticket = useRef(0);

  /* Every path into and out of the app ends here: verify the session with the server,
     load that account's record on this Mac, and land where the account actually is. */
  const route = useCallback(async (why: string): Promise<Account | null> => {
    const mine = ++ticket.current;
    console.log(`[daybook] route (${why}): checking the account`);
    let verified: Account | null = null;
    try {
      const result = await verifyAccount();
      verified = result.account;
      if (result.reason === "account-gone") setAuthNotice(ACCOUNT_GONE_NOTICE);
    } catch (err) {
      console.warn(`[daybook] route (${why}): account check failed:`, err);
      setAuthNotice((err as Error).message);
    }

    let record: UserSettings = {};
    if (verified) {
      const acct = verified;
      try {
        record = await daybook.loadSettings(acct.id);
        if (record.email !== acct.email) record = await daybook.saveSettings(acct.id, { email: acct.email });
      } catch (err) {
        console.warn(`[daybook] route (${why}): settings failed:`, err);
      }
    }

    if (mine !== ticket.current) return verified;
    const next = decideStage(verified, record);
    console.log(
      `[daybook] route (${why}): ${verified ? `signed in as ${verified.email}` : "signed out"} → ${next}`,
    );
    if (verified) setAuthNotice(null);
    setAccount(verified);
    setSettings(record);
    setStage(next);
    return verified;
  }, []);

  /* Launch opens straight from what this Mac knows (the saved session and this account's
     record), then confirms with Supabase in the background, as most desktop apps do.
     Waiting on the network first held every launch on a blank "Opening…". If the check
     finds the account gone, verifyAccount signs out and onSignedOut routes to sign-in. */
  useEffect(() => {
    const saved = savedAccount();
    if (!saved) {
      void route("launch");
      return;
    }
    const mine = ++ticket.current;
    void (async () => {
      let record: UserSettings = {};
      try {
        record = await daybook.loadSettings(saved.id);
      } catch (err) {
        console.warn("[daybook] route (launch): settings failed:", err);
      }
      if (mine !== ticket.current) return;
      const next = decideStage(saved, record);
      console.log(`[daybook] route (launch): opened from the saved session → ${next}`);
      setAccount(saved);
      setSettings(record);
      setStage(next);
      try {
        const result = await verifyAccount();
        if (result.reason === "account-gone") setAuthNotice(ACCOUNT_GONE_NOTICE);
        if (result.account?.id !== saved.id) void route("launch check");
        else if (result.account.email !== record.email) {
          setSettings(await daybook.saveSettings(saved.id, { email: result.account.email }));
        }
      } catch (err) {
        console.warn("[daybook] route (launch check): account check failed:", err);
        void route("launch check");
      }
    })();
  }, [route]);

  // Google's browser round-trip and the confirmation email both arrive here via the
  // OS (daybook://auth) in the desktop app; the browser-dev path redirects the page
  // instead. A callback that carries no tokens (e.g. a daybook://auth?ping=1 test) is
  // itself diagnostic — it proves the OS→app hop works and the failure is upstream.
  useEffect(() => {
    if (!isDesktop) return;
    return daybook.onAuthCallback((url) => {
      (async () => {
        try {
          const carriedTokens = await handleAuthRedirect(url);
          const acct = await route("browser callback");
          if (acct) return;
          setAuthNotice(
            carriedTokens
              ? "The link arrived and carried tokens, but no session came of it. Check that Google and Supabase agree on the client credentials."
              : "Good news, partly: the daybook:// handler works. The app received the link, but it carried no sign-in, so the browser step didn't complete (an 'Access blocked' page, usually).",
          );
        } catch (err) {
          setAuthNotice((err as Error).message);
        }
      })();
    });
  }, [route]);

  // The session can end under the app — signed out elsewhere, or a refresh the server
  // refused because the account is gone.
  useEffect(() => onSignedOut(() => void route("signed out")), [route]);

  const advance = useCallback(
    (patch: Partial<UserSettings>) => {
      if (!account) return;
      void daybook
        .saveSettings(account.id, patch)
        .then((next) => {
          setSettings(next);
          setStage(decideStage(account, next));
        })
        .catch((err: unknown) => console.warn("[daybook] saving a step failed:", err));
    },
    [account],
  );

  /* Saves a change made in Settings without moving the user to another screen. */
  const update = useCallback(
    (patch: Partial<UserSettings>) => {
      if (!account) return;
      void daybook
        .saveSettings(account.id, patch)
        .then(setSettings)
        .catch((err: unknown) => console.warn("[daybook] saving settings failed:", err));
    },
    [account],
  );

  /* The brief arrives on its own once setup is done: the scoreboard keeps the tick and
     watchdog installed for this folder (rewriting them if the folder changed) — unless the
     user stopped them in Settings, which the app then never overrides. Failures are shown
     on the scoreboard, not swallowed. */
  const [jobsProblem, setJobsProblem] = useState<string | null>(null);
  const folderPath = settings.folderPath;
  const jobsWanted = stage === "home" && Boolean(folderPath) && settings.backgroundJobs !== "off";
  useEffect(() => {
    if (!jobsWanted || !folderPath) return;
    void daybook.scheduleStart(folderPath).then((result) => {
      setJobsProblem(result.ok || result.code === "NEEDS_APP" ? null : result.message);
    });
  }, [jobsWanted, folderPath]);

  async function handleSignOut() {
    await signOut();
    await route("sign out");
  }

  const activeConnection: Connection | null =
    settings.connections?.find((c) => c.id === settings.activeConnectionId) ??
    settings.connections?.[0] ??
    null;

  if (stage === "loading") return <Opening />;

  if (stage === "login" || !account) {
    return (
      <LoginScreen authNotice={authNotice} onSignedIn={() => void route("sign in")} />
    );
  }

  switch (stage) {
    case "folder":
      return (
        <ConnectFolderScreen
          initialFolder={settings.folderPath}
          onConnected={(folder) => advance({ folderPath: folder })}
        />
      );
    case "provider":
      return (
          <ConnectProviderScreen
            userId={account.id}
            connections={settings.connections ?? []}
            activeId={settings.activeConnectionId}
            onboarding={!settings.setupCompletedAt}
            folderName={settings.folderPath?.split("/").filter(Boolean).pop()}
            onBack={settings.setupCompletedAt ? () => setStage("home") : undefined}
            onDone={(connections, activeConnectionId) => {
              // A switch after setup: the folder's config.json follows the new choice.
              const chosen = connections.find((c) => c.id === activeConnectionId);
              if (settings.setupCompletedAt && settings.folderPath && chosen) {
                void daybook
                  .recordConnection(settings.folderPath, chosen)
                  .catch((err: unknown) => console.warn("[daybook] recording the model failed:", err));
              }
              advance({ connections, activeConnectionId });
            }}
          />
      );
    case "setup":
      return (
          <SetupQuestionsScreen
            folder={settings.folderPath ?? ""}
            connection={activeConnection}
            onDone={(briefTime) => {
              setPlanOnArrival(true);
              void advance({ setupCompletedAt: new Date().toISOString(), briefTime });
            }}
          />
      );
    case "home":
      return (
        <ScoreboardScreen
          userId={account.id}
          planOnArrival={planOnArrival}
          onPlannedOnArrival={() => setPlanOnArrival(false)}
          folder={settings.folderPath ?? ""}
          connection={activeConnection}
          briefTime={settings.briefTime ?? "09:00"}
          backgroundJobs={settings.backgroundJobs ?? "on"}
          jobsProblem={jobsProblem}
          onChangeAI={() => setStage("provider")}
          onOpenSettings={() => setStage("settings")}
        />
      );
    case "settings":
      return (
        <SettingsScreen
          folder={settings.folderPath ?? ""}
          connection={activeConnection}
          backgroundJobs={settings.backgroundJobs ?? "on"}
          accountEmail={account.email}
          onBack={() => setStage("home")}
          onChangeAI={() => setStage("provider")}
          onSignOut={() => void handleSignOut()}
          onSaved={update}
        />
      );
    default:
      return null;
  }
}

/* The account check on launch is usually done in a blink; saying "Opening…" for that blink
   only flashes a word. It appears only if the check is still running after 0.8 s (a slow
   network), so a quick launch goes straight to its screen. */
function Opening() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 800);
    return () => window.clearTimeout(timer);
  }, []);
  return slow ? <p className="fade-in px-8 py-16 text-[13px] text-[var(--color-ink-faint)]">Opening…</p> : null;
}
