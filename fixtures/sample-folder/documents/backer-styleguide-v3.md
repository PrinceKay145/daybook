# Bäcker & Söhne — documentation style guide, v3

**Draft.** Three of four sections written. **"Voice" is the one still missing** — that is
today's first item, and it is the last thing blocking their sign-off.

**For:** Bäcker & Söhne engineering documentation
**Author:** Sam Whitfield · **Revision:** v3 · **Drafted:** 2026-03-09

---

## 1. Structure

Every page answers one question, named in the title. A page that answers two questions is two
pages that have not been split yet.

- **Task pages** start with the outcome, then the prerequisites, then the steps. Never the
  other way round — a reader who cannot reach the outcome should find that out in line one.
- **Reference pages** are tables. If it is prose, it is not reference.
- **Explanation pages** may be long. They are the only pages that may be.

## 2. Terminology

One term per concept, chosen once and used everywhere.

| Use | Never |
|---|---|
| order | job, ticket, request |
| dispatch | send, push, release |
| branch (a physical bakery) | store, shop, location |

Where the product UI disagrees with this table, the UI wins and the table is updated in the
same change. A style guide that contradicts the screen teaches readers to distrust it.

## 3. Code samples

- Every sample runs as written. No ellipses, no `...`, no "your key here" without a named
  placeholder format.
- Samples are tested in CI. An untested sample is a claim, not documentation.
- Errors are shown, not implied. If a call can fail, the sample shows the failure branch.

## 4. Voice

> ⚠️ **NOT WRITTEN YET.** This is the remaining section. See DAY-STATE.md — today's item 1.
