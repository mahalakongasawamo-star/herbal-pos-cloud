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

- 2026-09-29: Docker installed, Phase 0 actually run and shown (all three
  seed users logged in through the real local stack, including through a
  shared devtunnel once — needed two fixes: `[auth.email].enable_signup`
  in config.toml gates the *whole* email/password provider, not just
  self-signup, and `next.config.ts` needs `experimental.serverActions.
  allowedOrigins` including `localhost:3000` because a devtunnel's local
  forwarding agent rewrites `Origin` to the local target before Next
  sees it). Repo pushed to GitHub (mahalakongasawamo-star/herbal-pos-cloud,
  public). User said "continue next phase" — took as go-ahead — so Phase 1
  (SPEC §1's MVP-parity bar: all 7 real screens) is now built and
  integrated. Added one schema migration along the way
  (20260929100000_settings.sql — a singleton `settings` table; SPEC.md §3
  never listed one, and Options/receipt printing need it. Shown to the
  user, applied same-session per CLAUDE.md's rule on schema changes).
  Two legacy panels dropped on purpose, not ported: Options' "Cashiers"
  (replaced by a read-only Staff list — the cashier is the signed-in user
  now, SPEC §9, and creating an account needs the service-role key the
  browser never has) and "Data backup" (nothing analogous once Postgres
  is the source of truth; SPEC §1 already assigns backup verification to
  Phase 2). Built POS + the receipt/print system myself (highest risk —
  money and stock deduction); dispatched the other 6 screens
  (Inventory/Add Stock/Product master/Options+Setup guide/Sales log/
  Reports) as parallel Agent-tool calls against a shared contract
  (lib/types.ts, lib/mappers.ts, lib/rpc/*, lib/data/*,
  components/providers/catalog-provider.tsx, lib/hooks/use-live-stock.ts,
  components/receipt/print-provider.tsx) — all 6 came back clean on
  their own, and the only integration conflict was one shared file
  (app/(app)/layout.tsx) that needed CatalogProvider moved to wrap
  AppShell itself, not just {children}, since AppShell's own Setup-guide
  Drawer needs catalog data too.
  Found one real bug only once real queries ran (tsc/build stayed silent
  about it): `lib/data/catalog.ts`'s products→package_inclusions embed
  needed its OWN fkey hint — package_inclusions has two FKs to products
  (package_product_id, component_product_id), so PostgREST can't infer
  either side of that embed without one.
  **Verified, all against the real local stack, not assumed:** tsc/lint/
  build all clean repo-wide; all 7 routes render with no server crash for
  all three roles with correct access gating; a 15-point functional pass
  exercising the exact query/RPC path each screen uses (price edit,
  receive stock, commit a sale, sales list + receipt detail, the Reports
  query, a full receive→sell→void stock-balance cycle, add a member
  tier, update settings, the staff list, RLS blocking a manager's price
  edit) — all pass.
  **Not yet done:** no real browser was available this session
  (Playwright's Chromium download timed out on this network) — every
  check above is server-rendered HTML + direct Supabase queries, not an
  actual hydrated browser session. Client-side-only concerns (focus
  management, keyboard shortcuts, the realtime subscriptions actually
  firing UI updates on a second tab, print/download dialogs) have NOT
  been exercised end-to-end and are worth the user's own look before
  calling Phase 1 truly done. `types/database.ts` is regenerated
  (`npm run db:types`) — do that again after any future migration.
