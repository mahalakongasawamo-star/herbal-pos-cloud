# CLAUDE.md — Herbal POS Cloud

Session-continuity and working rules. **Read this first, every session,
before touching code.** Full detail lives in `SPEC.md` — this file is the
short version plus whatever changed since it was written.

## What we're building

The cloud version of `herbal-pos` (a working, tested Vite + React POS for a
Philippine herbal/MLM product line — Dok Honey's Tibicos, entry packages,
coffee/powder/rub/oil/liquid lines). Two branches, MNLA and BAGUIO, each
with their own physical stock, sharing one database so anyone with the
right role can see both live. Full reasoning for that design in `SPEC.md`
§0 — read it before assuming "shared" means "one pooled stock number." It
doesn't.

The Vite app already exists and works — this is a **port**, not a rebuild.
Its source is at `./legacy-vite-app/` (unzipped from `herbal-pos-source.zip`).
Read it before writing new UI code; most of the component/design layer
carries over close to as-is. See `SPEC.md` §10 for exactly what ports vs.
what gets rebuilt.

## Stack

- **Next.js 15** App Router, TypeScript
- **Supabase** — Postgres, Auth, Row-Level Security, Realtime
- **Tailwind CSS** — reuse the existing design tokens, don't reinvent them
- **Vercel** deploy (frontend) + **Supabase Cloud** (backend)
- Money: `numeric(14,2)`, PHP (₱); timestamps: UTC stored, Asia/Manila shown

## Golden rules (do not violate)

1. **`stock_ledger` is append-only.** Never `UPDATE` or `DELETE` a row.
   Corrections are new signed rows referencing the original.
2. **Void, don't delete.** Sales, stock-ins — cancelled/voided, never removed.
3. **Every sale, void, and stock movement is one atomic Postgres RPC.**
   Never split a money-or-stock write across two client round trips.
4. **Receipt numbers are generated server-side, inside the transaction.**
   Never trust or accept one from the client.
5. **RLS is on for every table, checked against `profiles`,** never against
   a `branch_id` or `role` the client claims to have.
6. **Stock is per branch.** There is no global stock number anywhere.
7. **No single-tab lock.** The Vite app's `BroadcastChannel` tab-lock is
   dead code here — concurrent cashiers across branches (and across tabs)
   are the normal, correct case now. If you find yourself porting it,
   stop — re-read `SPEC.md` §9.

## Process

- Work phase by phase (`SPEC.md` §1). **Stop and show a working demo of the
  current phase before starting the next one** — don't chain multiple
  phases into one unreviewed session.
- When a design decision in `SPEC.md` turns out to be wrong once you're
  actually building it, say so and propose the change — don't silently
  build around it.
- Before any schema change once Phase 0 is done: show the migration SQL
  first, don't just run it.

## Where things are

- `SPEC.md` — full spec: data model, RLS, the four RPCs, pricing rules,
  repo structure, Definition of Done per phase.
- `./legacy-vite-app/` — the existing working app, source of the UI and
  design tokens to port.
- `KICKOFF_PROMPT.md` — not needed after session 1; it was the first
  message, not a reference doc.
- `AGENTS.md` — Next.js 16's managed agent rules (`next dev` rewrites it).
  Next 16 differs from older training data (e.g. `middleware.ts` is now
  `proxy.ts`); read `node_modules/next/dist/docs/` before writing Next code.

@AGENTS.md

## Session log

*(Claude Code: append a dated one-line entry here at the end of each
session — what phase you're on, what's left, anything you'd want your next
self to know before re-reading the rest of this file.)*

- 2026-09-28: Phase 0 built and verified, not yet shown to the user for
  go-ahead. Next.js 16 + Tailwind v4 scaffold, design tokens/fonts/ui.tsx
  ported, Supabase Auth + shell + 7 empty route pages, all three
  migrations + seed.sql, all four RPCs. `npm run build`/`tsc`/`lint` all
  pass; dev-server smoke test confirms the proxy/login work with no
  Supabase running. The schema/RLS/RPCs were verified against a *real*
  PostgreSQL 17 without Docker, via the npm `embedded-postgres` package
  (see the note below) — found and fixed a critical bug (every sale and
  reversal failed: a CHECK constraint fires on the *proposed* INSERT row
  before ON CONFLICT resolves, so `apply_stock_ledger`'s upsert had to
  become UPDATE-first) plus 12 other findings (owner-only package
  creation, a TOCTOU between a package's receipt snapshot and its
  deduction, idempotent-retry request-hash check, deadlock-safe
  registration ordering, branch-code immutability, seed.sql/local_users.sql
  cloud-safety split, tier_prices/discount_pct canonicalization). 37
  scenarios re-verified passing after the fixes, including per-role RLS
  (owner/manager/cashier × branches/stock/sales/products/options/profiles)
  and the concurrent-commit_sale race the kickoff asked for.
  **Still blocked:** Docker Desktop isn't installed (so `supabase start`
  hasn't run) and there's no linked Supabase Cloud project yet — the
  actual local stack, `npm run db:reset`, and login as the three seed
  users have NOT been done. Do that before claiming Phase 0 done.
  **Useful trick for next time:** you don't need Docker to test SQL
  against real Postgres — `npm i -D embedded-postgres pg` in a scratch
  folder gets a real, disposable Postgres via plain npm, no admin rights.
  Stub `auth.users`/`auth.uid()` (reads
  `request.jwt.claim.sub`/`request.jwt.claims`) and the `anon`/`authenticated`
  roles by hand; `SET ROLE authenticated` is required to actually exercise
  RLS (a superuser connection bypasses it entirely and every test "passes"
  regardless of policy). See the session's scratchpad epg/h.mjs if it
  still exists.
