/* The v1 flow, from the owner's drawing: login → connect a folder → connect an AI
   provider → setup questions → scoreboard. Subsequent launches go straight to the
   scoreboard. Each account's folder choice and connections live in app data under its
   user id, the answers live in the user's folder, and the account holds an email —
   nothing else. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  handleAuthRedirect,
  onSignedOut,
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

type Stage = "loading" | "login" | "folder" | "provider" | "setup" | "home";

const ACCOUNT_GONE_NOTICE =
  "Your sign-in on this Mac has ended — the account was deleted or signed out elsewhere. Sign in, or create a new account.";

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

  useEffect(() => {
    void route("launch");
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
              : "Good news, partly: the daybook:// handler works — the app received the link, but it carried no sign-in. So the browser step didn't complete (an 'Access blocked' page, usually).",
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

  async function handleSignOut() {
    await signOut();
    await route("sign out");
  }

  const activeConnection: Connection | null =
    settings.connections?.find((c) => c.id === settings.activeConnectionId) ??
    settings.connections?.[0] ??
    null;

  if (stage === "loading") {
    return <p className="mx-auto max-w-md px-4 py-16 text-sm text-[var(--color-ink-faint)]">Opening…</p>;
  }

  if (stage === "login" || !account) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        {authNotice && (
          <p className="mx-auto mb-4 max-w-md rounded-[var(--radius-card)] border border-[var(--color-warn)]/40 px-3 py-2 text-xs text-[var(--color-warn)]">
            {authNotice}
          </p>
        )}
        <LoginScreen onSignedIn={() => void route("sign in")} />
      </div>
    );
  }

  switch (stage) {
    case "folder":
      return (
        <div className="mx-auto max-w-4xl px-4 py-8">
          <ConnectFolderScreen
            initialFolder={settings.folderPath}
            onConnected={(folder) => advance({ folderPath: folder })}
          />
        </div>
      );
    case "provider":
      return (
        <div className="mx-auto max-w-4xl px-4 py-8">
          <ConnectProviderScreen
            userId={account.id}
            connections={settings.connections ?? []}
            activeId={settings.activeConnectionId}
            onDone={(connections, activeConnectionId) =>
              advance({ connections, activeConnectionId })
            }
          />
        </div>
      );
    case "setup":
      return (
        <div className="mx-auto max-w-4xl px-4 py-8">
          <SetupQuestionsScreen
            folder={settings.folderPath ?? ""}
            connection={activeConnection}
            onDone={(briefTime) =>
              advance({ setupCompletedAt: new Date().toISOString(), briefTime })
            }
          />
        </div>
      );
    case "home":
      return (
        <ScoreboardScreen
          accountEmail={account.email}
          folder={settings.folderPath ?? ""}
          connection={activeConnection}
          briefTime={settings.briefTime ?? "09:00"}
          onChangeAI={() => setStage("provider")}
          onSignOut={() => void handleSignOut()}
        />
      );
    default:
      return null;
  }
}
