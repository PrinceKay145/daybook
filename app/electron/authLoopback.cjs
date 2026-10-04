/* Google sign-in's way back into the app, the way RFC 8252 recommends for desktop apps: a
   listener on 127.0.0.1 that exists only while a sign-in is in flight.

   Why not daybook://auth for this: the browser cannot show a page for a custom scheme, so
   after handing the link to macOS the tab is left spinning on Google's page forever. With
   the loopback, the tab lands on a real page ("you're signed in — close this tab") and the
   app comes forward on its own.

   The tokens arrive in the URL fragment, which browsers never send to a server, so the
   page's script posts them back to this listener — as JSON (a cross-origin page cannot
   send JSON here without a CORS preflight this server never approves) and with a
   one-time nonce only this page carries. Then the listener closes. Supabase's Redirect
   URLs must allow http://127.0.0.1:5368?/auth/callback (app/README.md). */

const crypto = require("node:crypto");
const http = require("node:http");

const PORTS = [53682, 53683, 53684, 53685, 53686, 53687, 53688, 53689];
const LIFETIME_MS = 10 * 60 * 1000;

let active = null; // { server, nonce, timer }

function stop() {
  if (!active) return;
  clearTimeout(active.timer);
  active.server.close();
  active = null;
}

function page(nonce) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Daybook</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; --bg:#f6f5f3; --card:#fffefc; --ink:#1c1b19; --soft:#5d5a55; --line:#e3e0da; --warn:#8a4b2a; }
  @media (prefers-color-scheme: dark) { :root { --bg:#14151a; --card:#1c1e24; --ink:#ecebe8; --soft:#a7a49e; --line:#2b2e36; --warn:#d79a70; } }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--ink);
         font:15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { max-width:26rem; margin:16px; padding:28px; background:var(--card); border:1px solid var(--line); border-radius:14px; }
  h1 { font-size:1.15rem; margin:0 0 6px; }
  p { margin:0; color:var(--soft); }
  .warn { color:var(--warn); }
</style></head>
<body><main><h1 id="title">Finishing sign-in…</h1><p id="note">One moment.</p></main>
<script>
(function () {
  var hash = location.hash.replace(/^#/, "");
  var query = new URLSearchParams(location.search);
  var error = query.get("error_description") || new URLSearchParams(hash).get("error_description");
  // The tokens should not stay in the address bar or the browser's history.
  history.replaceState(null, "", location.pathname);
  function say(title, note, warn) {
    document.getElementById("title").textContent = title;
    var p = document.getElementById("note");
    p.textContent = note;
    if (warn) p.className = "warn";
  }
  fetch("/auth/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce: ${JSON.stringify(nonce)}, fragment: hash, error: error })
  }).then(function (response) {
    if (!response.ok) throw new Error();
    if (error) say("Sign-in didn't finish", error + " — go back to Daybook and try again.", true);
    else say("You're signed in to Daybook", "You can close this tab — Daybook has carried on.");
  }).catch(function () {
    say("This sign-in link has already been used", "Go back to Daybook; if it isn't signed in, choose Continue with Google again.", true);
  });
})();
</script></body></html>`;
}

/* The first free port of the few Supabase is told to allow; one in use moves to the next. */
function listen(server, ports) {
  return new Promise((resolve, reject) => {
    const attempt = (index) => {
      if (index >= ports.length) return reject(new Error("No free local port for the sign-in to return to."));
      const onError = (err) => {
        server.off("listening", onListening);
        if (err.code === "EADDRINUSE") attempt(index + 1);
        else reject(err);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(ports[index]);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(ports[index], "127.0.0.1");
      return undefined;
    };
    attempt(0);
  });
}

/** Starts listening for one sign-in and returns the redirect URL to give Supabase.
    `onReturn` gets a daybook://auth URL in the same shape the custom scheme delivers, so the
    renderer completes it the same way. A new sign-in replaces an unfinished one. */
async function start(onReturn) {
  stop();
  const nonce = crypto.randomBytes(16).toString("hex");
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/auth/callback") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(page(nonce));
    }
    if (req.method === "POST" && url.pathname === "/auth/complete") {
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
        res.writeHead(415);
        return res.end();
      }
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 64 * 1024) req.destroy();
      });
      req.on("end", () => {
        let message = null;
        try {
          message = JSON.parse(body);
        } catch {
          message = null;
        }
        if (!active || !message || message.nonce !== active.nonce) {
          res.writeHead(403);
          return res.end();
        }
        res.writeHead(204);
        res.end();
        stop();
        const back = message.error
          ? `daybook://auth?error_description=${encodeURIComponent(String(message.error))}`
          : `daybook://auth#${String(message.fragment ?? "")}`;
        onReturn(back);
      });
      return undefined;
    }
    res.writeHead(404);
    return res.end();
  });
  const port = await listen(server, PORTS);
  active = { server, nonce, timer: setTimeout(stop, LIFETIME_MS) };
  return `http://127.0.0.1:${port}/auth/callback`;
}

module.exports = { start, stop };
