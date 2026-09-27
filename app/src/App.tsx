/* The v1 flow, from the owner's drawing: login → connect a folder → connect an AI
   provider → setup questions → scoreboard. Subsequent launches go straight to the
   scoreboard. The folder choice and provider live in app data (the app's own state),
   the answers live in the user's folder, and the account holds an email — nothing else. */

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccount, handleAuthRedirect, onAuthChange, signOut, type Account } from "@/lib/auth";
import { daybook, isDesktop, type AppSettings, type Connection } from "@/lib/daybook";
import { LoginScreen } from "@/screens/Login";
import { ConnectFolderScreen } from "@/screens/ConnectFolder";
import { ConnectProviderScreen } from "@/screens/ConnectProvider";
import { SetupQuestionsScreen } from "@/screens/SetupQuestions";
import { ScoreboardScreen } from "@/screens/Scoreboard";

type Stage = "loading" | "login" | "folder" | "provider" | "setup" | "home";

/* settings is optional-and-null-tolerant by design: it arrives from three async paths
   (init, save, the Google callback) and none of them may crash the flow on a bad value.
   Onboarding is per account: home is reached only by the account that completed setup
   itself (the onboardedFor stamp) — any other account, and any pre-stamp legacy state,
   walks the full setup again. */
function nextStage(settings?: AppSettings | null, account?: Account | null): Stage {
  const s = settings ?? {};
  if (!s.folderPath) return "folder";
  if (!s.connections || s.connections.length === 0) return "provider";
  if (!account || !s.setupCompleted || s.onboardedFor !== account.email) return "setup";
  return "home";
}

export default function App() {
  const [stage, setStage] = useState<Stage>("loading");
  const [account, setAccount] = useState<Account | null>(null);
  const [settings, setSettings] = useState<AppSettings>({});
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // The Google callback lands after onboarding may already have changed settings;
  // read the fresh values through refs instead of closing over state.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const accountRef = useRef(account);
  accountRef.current = account;

  // First paint: restore the session and the app's own state, then land where the
  // user actually is in the flow. getAccount() carries its own timeout, so this
  // always lands somewhere — the breadcrumbs land in the app's terminal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      console.log("[daybook] init: reading settings and account");
      const [loaded, acct] = await Promise.all([
        daybook.loadSettings().catch((err: unknown) => {
          console.warn("[daybook] init: settings failed:", err);
          return {} as AppSettings;
        }),
        getAccount().catch((err: unknown) => {
          console.warn("[daybook] init: account check failed:", err);
          return null;
        }),
      ]);
      if (cancelled) return;
      console.log(`[daybook] init: done — ${acct ? `signed in as ${acct.email}` : "signed out"}`);
      // A single pre-connections provider record is promoted into the list form.
      let loadedSettings: AppSettings = loaded ?? {};
      if (!loadedSettings.connections?.length && loadedSettings.provider) {
        const legacy = loadedSettings.provider;
        loadedSettings = {
          ...loadedSettings,
          connections: [
            {
              id: legacy.id,
              label: legacy.label,
              authKind: legacy.authKind,
              cliBinary: legacy.cliBinary,
            },
          ],
          activeConnectionId: legacy.id,
        };
        void daybook
          .saveSettings({
            connections: loadedSettings.connections,
            activeConnectionId: loadedSettings.activeConnectionId,
          })
          .catch((err: unknown) => console.warn("[daybook] init: promotion save failed:", err));
      }
      setSettings(loadedSettings);
      setAccount(acct);
      setStage(acct ? nextStage(loadedSettings, acct) : "login");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Google's browser round-trip arrives here via the OS (daybook://auth) in the
  // desktop app; the browser-dev path redirects the page instead. A callback that
  // carries no tokens (e.g. a daybook://auth?ping=1 test) is itself diagnostic —
  // it proves the OS→app hop works and the failure is upstream, at consent.
  useEffect(() => {
    if (!isDesktop) return;
    daybook.onAuthCallback((url) => {
      (async () => {
        try {
          const carriedTokens = await handleAuthRedirect(url);
          const acct = await getAccount();
          if (acct) {
            setAccount(acct);
            setAuthNotice(null);
            setStage(nextStage(settingsRef.current, acct));
          } else if (carriedTokens) {
            setAuthNotice(
              "The link arrived and carried tokens, but no session came of it. Check that Google and Supabase agree on the client credentials.",
            );
          } else {
            setAuthNotice(
              "Good news, partly: the daybook:// handler works — the app received the link, but it carried no sign-in. So Google consent is the step that didn't complete (an 'Access blocked' page in the browser, usually).",
            );
          }
        } catch (err) {
          setAuthNotice((err as Error).message);
        }
      })();
    });
  }, []);

  // Password sessions can be signed out elsewhere; keep in step.
  useEffect(() => {
    return onAuthChange((acct) => {
      if (!acct) {
        setAccount(null);
        setStage("login");
      }
    });
  }, []);

  const save = useCallback(async (patch: Partial<AppSettings>) => {
    const next = (await daybook.saveSettings(patch)) ?? {};
    setSettings(next);
    return next;
  }, []);

  const advance = useCallback(
    (patch: Partial<AppSettings>) => {
      void save(patch).then((next) => setStage(nextStage(next, accountRef.current)));
    },
    [save],
  );

  async function handleSignOut() {
    await signOut();
    setAccount(null);
    setStage("login");
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
        <LoginScreen
          onSignedIn={(acct) => {
            setAccount(acct);
            setAuthNotice(null);
            void save({ accountEmail: acct.email }).then((next) => setStage(nextStage(next, acct)));
          }}
        />
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
              advance({
                setupCompleted: true,
                onboardedFor: account.email,
                briefTime,
              })
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
