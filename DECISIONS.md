# DECISIONS

**Purpose:** spec §14 lists questions only the owner can answer. Left inside a 540-line
document, a build session will either guess at them or stall. This file puts each one in one
place with an explicit answer — including *"deferred, don't decide this for me."*

**Rule for any build session reading this:** if a decision below is marked **DEFERRED**, you may
not decide it yourself, may not design around one option as if it were chosen, and may not ask
again mid-build. Build the part that is common to both options and leave a seam.

**Last updated:** 2026-09-24 · ⬜ = awaiting the owner

---

## 🔴 Blocking — the build cannot start without these

### D1. The product name
**Blocks:** domain, GitHub org, repo name, macOS bundle identifier, CLI name, every import path.
Renaming after the first commit is painful; after the first user it is worse.

**Shortlist:** Daybook · Adjutant · Sentry · Almanac · Majordomo · Steward · Cairn · Reveille · Understudy · Deputy · Firstlight · Plumb · (or keep PK Secretary)

**ANSWER:** ⬜ Daybook

**Also fix at the same time:**
- Domain: ⬜ ______________________ *(check availability before committing to the name)*
- GitHub org / repo: ⬜ ______________________
- Bundle id (e.g. `io.example.daybook`): ⬜ ______________________

---

### D2. Repository visibility from the first commit
**Blocks:** whether anything can be committed publicly, and whether the fixtures, the laws and
the daemon are readable by strangers on day one.

| Option | Consequence |
|---|---|
| **Open source (MIT/Apache)** | Anyone can fork it. The laws — the actual IP — become public. Good for trust and contribution, bad for differentiation. |
| **Source-available** | Readable, not freely reusable. Trust benefits, keeps the moat. |
| **Closed** | Simplest now. Can always open later; the reverse is not true. |

**Recommendation: start private and decide before the first public push.** Costs nothing, keeps
every option open, and "we opened it later" is a normal story while "we closed it" is not.

**ANSWER:** ⬜ ______________________

---

## 🟡 Should be answered before week 3

### D3. Local-first, or server-side state?
**Spec §8.5 calls this "the one thing to decide early because it is architectural."**

`PKSECRETARY-ARCHITECTURE.md` **assumes local-first throughout** — the folder is the source of
truth, the server holds an account row and nothing about anyone's life. The reasoning: a breach
of a server holding DAY-STATE content ends a product whose whole pitch is trust, the observance
module would make you a controller of GDPR Art. 9 special-category data, and the people lane
holds data about third parties who never consented.

**Recommendation: confirm local-first.** If you disagree, say so now — the storage layer, the
sync story and the privacy policy all change, and changing it in month three means rewriting all
three.

**ANSWER:** ⬜ confirm local-first / ⬜ something else: ______________________

---

### D4. Does the `local_cli` path ship in v1?
Detecting an installed `claude` / `codex` CLI and invoking it as a subprocess is the path that
demos the original vision and costs the user nothing extra. It is also a **grey zone**: Anthropic
prohibits third parties routing through subscription credentials, and while local invocation
never touches the token, their stated intent is that subscription OAuth serves their own tools.
See architecture §3.

**Recommendation: ship both paths.** `local_cli` as the headline, `api_key` as the fallback that
keeps the product alive if a policy moves. Three extra days for insurance against an
externally-controlled single point of failure.

**ANSWER:** ⬜ both / ⬜ api_key only / ⬜ local_cli only

---

### D5. Windows in v1?
Microsoft Artifact Signing is unavailable to you (US/Canada organisations, 3+ years of history,
individual onboarding paused). A standard OV certificate is ~$200–400/yr plus a hardware token.
Notifications, autostart and paths all differ and all will surprise you.

**Recommendation: defer.** Ship macOS-only to Mac-using friends, add Windows once the product
is proven.

**ANSWER:** ⬜ defer / ⬜ include — budget approved: £____

---

### D6. Does the religious timetable preset ship?
Spec §14 #6. This has changed shape since it was written: the architecture **generalises** the
module to "a daily-shifting, location-dependent schedule with source precedence," and the
fixture exercises it with a secular daylight schedule. So the engine ships either way.

**The remaining question is narrower:** does a prayer-timetable *preset* ship in the product,
with its three-source precedence and month-end timetable reminder?

It is the best engineering in the system and serves an audience nobody builds for. It is also
the most personal thing in it, and it will shape who thinks the product is for them.

**ANSWER:** ⬜ ships as a preset / ⬜ engine only, no preset / ⬜ defer

---

## ⚪ Not blocking — answer before week 8

### D7. How many alpha users, and who?
Sets the week 8 scope. Two is enough to learn from and few enough to support properly.
Spec §11 risk 2: the alpha's real job is finding out which laws are universal and which are
personal to one life.

**ANSWER:** ⬜ number: ____ · names: ______________________

### D8. Free for friends, or priced from the start?
Pricing at zero is hard to reverse. Free for the named alpha is normal and does not set a
precedent, provided it is framed as an alpha and not as "free".

**ANSWER:** ⬜ ______________________

### D9. Telemetry — on by default, or opt-in?
The architecture says **opt-in, off by default**. Anonymous event names and counts only; never
content. Slower learning, but consistent with a product whose pitch is "we never see anything."

**ANSWER:** ⬜ opt-in (recommended) / ⬜ on by default with a visible toggle

---

## ✅ Already settled — recorded so nobody reopens them

| # | Decision | Settled | When |
|---|---|---|---|
| S1 | **Desktop application**, not a website or a browser+terminal runner | Tauri shell, Python daemon bundled as a sidecar runner. The terminal step excludes the audience in spec §2; a dock icon is a re-entry point where a browser tab is not | 2026-09-24 |
| S2 | **Fully anonymised** product | No name, employer, city, institution, goal, faith detail or financial state from the owner's life enters the repo, README, website or onboarding | 2026-09-12 |
| S3 | **Do not rewrite the daemon** | Port only when the test suite is green and nothing is on a deadline | spec §13 |
| S4 | **Bring your own credential** | No hosted proxy of anyone's subscription. Ever. | 2026-09-24 |
| S5 | **The laws in spec §6 are fixed** | Everything from §8 on is negotiable; §6 is not | spec |
| S6 | **No shell actions in v1** | Security boundary, not a scope cut — the agent writes the config, so a model-authored action target is a laundering path | 2026-09-24 |
| S7 | **No accounts in v1** | Nothing on the server needs an identity until billing exists | 2026-09-24 |

---

*A decision recorded here in prose is not applied until the thing that actually reads it — the
config, the schema, the repo settings — has been changed to match.*
