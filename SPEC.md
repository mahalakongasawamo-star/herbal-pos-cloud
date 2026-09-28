# Herbal POS Cloud — Full Specification

**Version:** 1.0
**Stack:** Next.js 15 (App Router) · TypeScript · Supabase (Postgres + Auth + RLS + Realtime) · Tailwind CSS
**Deployment:** Vercel (frontend) + Supabase Cloud (backend)
**Predecessor:** `herbal-pos` — the Vite + React app already built and tested (browser-local IndexedDB, single till). This spec turns it into a real multi-branch system. **Port the UI, replace the storage layer** — see §10.

---

## 0. The one call this whole spec hinges on

"Manila and Baguio should share one inventory" does **not** mean one pooled
stock number. Manila's shelf and Baguio's shelf are physically different
stock — a unit sitting in Baguio cannot be sold in Manila. Pooling the count
would make the number lie the moment either branch makes a sale.

What "shared" should actually mean, and what this spec builds:

- **Stock is per branch.** Each branch has its own `stock_balances` row per
  product. Selling in Manila only ever deducts Manila's stock.
- **Visibility is shared.** Anyone with the right role can see both
  branches' stock, sales, and reports, live, from anywhere — no more "check
  the other device."
- **Everything syncs in real time.** A manager watching a dashboard sees a
  Baguio sale land the instant it's saved, no reload.
- A closely related, genuinely new capability this unlocks: **inter-branch
  stock transfer** (Manila ships 10 units to Baguio). Listed as a Phase 3
  nice-to-have below — flag if you want it pulled into Phase 1 instead.

If this isn't what you meant by "shared," stop Claude Code before Phase 0
and say so — the schema below is built around this model and a genuine
pooled-stock design would look different (no `branch_id` on stock at all).

---

## 1. Scope by phase

Build in order. Get a phase to Definition-of-Done before starting the next
— this project's track record (AurumSpa, DHT) is that skipping this step is
where sessions go sideways.

### Phase 0 — Foundation
Next.js 15 scaffold · Supabase project + local CLI linked · schema migration
(all tables below) · RLS policies · Supabase Auth wired up · design tokens
and fonts ported from the Vite app · empty shell pages for every route.

### Phase 1 — MVP parity (the current app, cloud-backed)
Everything `herbal-pos` already does, now shared: login, POS, receipt
printing, sales log, inventory (per branch), add stock, reports, product
master, options, setup guide. Multiple cashiers, multiple branches, real
time, at once. This is the bar for "done" — not more than the Vite app,
just *shared*.

### Phase 2 — Cross-branch operations
Combined dashboard (both branches' numbers side by side and totalled) ·
server-side CSV export for large date ranges · scheduled/automatic backups
(Supabase already does this on paid tiers — verify, don't rebuild it) ·
per-branch vs. all-branch report toggle for the owner role.

### Phase 3 — Nice-to-haves (do not build unless asked)
Inter-branch stock transfer (with an approval step) · low-stock email/SMS
alert · barcode scanner hardware input · ESC/POS thermal receipt printer
integration (skip the A4-print-dialog dance entirely at the counter) ·
offline queueing for spotty internet (see §11).

---

## 2. Roles

Three, not eight — this is a two-branch small business, not an ERP. Add
more only when a real need shows up.

| Role | Scope | Can do |
|---|---|---|
| `owner` | all branches | everything, including Options, Product master, both branches' reports |
| `manager` | all branches (or one, if assigned) | POS, sales log, inventory, add stock, reports — not Options, not price edits unless also owner |
| `cashier` | one branch only | POS, view/print/void *their own branch's* sales log — no reports, no inventory edits beyond receiving stock they were handed |

A `profiles` row (extending `auth.users`) carries `role` and, for cashiers
and single-branch managers, `branch_id`. `owner` and multi-branch `manager`
have `branch_id = null` (meaning "all").

---

## 3. Data model

All money `numeric(14,2)`, PHP pesos. All timestamps `timestamptz`, stored
UTC, displayed `Asia/Manila`. All primary keys `uuid default gen_random_uuid()`
unless noted.

```
branches
  id, code (text, unique — 'MNLA', 'BAGUIO'), name, active

profiles                          -- extends auth.users
  id (= auth.users.id), full_name, role ('owner'|'manager'|'cashier'),
  branch_id (nullable → all branches), active

categories
  id, name, is_package (bool), sort_order

products
  id, sku (text, unique), name, category_id, is_package (bool),
  price, member_price, tier_prices (jsonb: { tierName: price }),
  reorder_level (int), active (bool)

package_inclusions                -- only for is_package products
  package_product_id, component_product_id, qty (int)
  primary key (package_product_id, component_product_id)

member_tiers
  id, name, discount_pct (numeric), sort_order

payment_methods
  id, name, is_cash (bool), sort_order

stock_ledger                      -- APPEND-ONLY. Never UPDATE or DELETE.
  id, branch_id, product_id, delta (int, +/-),
  reason ('receive'|'sale'|'void_restock'|'reversal'|'adjustment'),
  ref_sale_id (nullable), ref_stock_in_id (nullable),
  note, created_by (→ profiles.id), created_at

stock_balances                    -- one row per (branch, product); derived,
  branch_id, product_id, qty         maintained by a trigger on stock_ledger.
  primary key (branch_id, product_id)   Never write to this table directly.

stock_ins                         -- a receiving batch (groups ledger rows)
  id, branch_id, date, note, created_by, created_at,
  reversed (bool), reversed_at

sales
  id, branch_id, receipt_no (text, unique — see §7 for generation),
  customer_name, leader_name, upline_name,
  customer_tier ('New'|'Member'), member_tier (nullable),
  cashier_id (→ profiles.id), payment_method_id, is_cash, reference,
  gross_total, discount_total, total_due, tendered, change,
  status ('completed'|'void'), void_reason, voided_at, voided_by,
  created_at

sale_items
  id, sale_id, product_id, name (snapshot), category (snapshot),
  is_package (snapshot), qty, unit_price, charged_unit, gross, discount,
  net, rule_label (snapshot, e.g. "Manager price"),
  inclusions (jsonb snapshot: [{sku,name,qty}], packages only)
```

Snapshotting `name`/`category`/`rule_label`/`inclusions` on `sale_items`
matters: a product renamed or repriced next month must not change what an
old receipt says it sold.

---

## 4. Golden rules (do not violate)

1. **`stock_ledger` is append-only.** A correction is a new signed row
   referencing the original (`ref_stock_in_id` / `ref_sale_id`) — never
   `UPDATE`/`DELETE` an existing row. `stock_balances` is a derived cache;
   if it and the ledger ever disagree, the ledger is right and the balance
   gets recomputed, not the other way round.
2. **Void, don't delete.** A voided sale keeps its row, flips `status`,
   gets reversing ledger rows. Nothing about a completed sale is ever
   hard-deleted.
3. **Every write that touches money or stock is one atomic RPC** (a single
   Postgres function, one transaction). No "insert the sale, then insert
   the stock rows" as two round trips from the client — see §6.
4. **Receipt numbers are server-generated**, inside the same transaction as
   the sale (§7). The client never invents one — two cashiers saving at the
   same instant must never collide.
5. **RLS is on for every table**, no exceptions, checked against `profiles`
   (`role`, `branch_id`), not against anything the client sends.

---

## 5. Pricing rules (unchanged from the Vite app — port exactly)

New customers pay retail. For members, in order:
1. a tier-specific price in `products.tier_prices[memberTier]`,
2. else `products.member_price`,
3. else `retail × (1 − tier's discountPct / 100)`.

Line: `unit_price = max(retail, charged)`, `gross = unit_price × qty`,
`net = charged × qty`, `discount = gross − net`.

---

## 6. Core RPCs

All `security definer`, all validate inside the transaction (never trust a
total the client computed — recompute server-side from current prices and
compare, reject on mismatch beyond a centavo of rounding).

- **`commit_sale(payload jsonb) → sale`**
  Validates every line's stock against `stock_balances` for the caller's
  branch (packages expanded to components first). Generates the receipt
  number (§7). Inserts `sales` + `sale_items`. Inserts one `stock_ledger`
  row per component deducted (`reason='sale'`). Raises on any shortfall —
  all or nothing.
- **`void_sale(sale_id uuid, reason text) → sale`**
  Only the branch's own cashier/manager or an owner. Flips status, inserts
  reversing `stock_ledger` rows (`reason='void_restock'`).
- **`receive_stock(branch_id uuid, entries jsonb[], new_products jsonb[]) → stock_in`**
  Creates the `stock_ins` header, registers any new products, inserts
  ledger rows (`reason='receive'`).
- **`reverse_stock_in(stock_in_id uuid) → void`**
  Refuses if it would take any `stock_balances.qty` negative. Inserts
  reversing rows (`reason='reversal'`), flags the header `reversed`.

## 7. Receipt numbers

Format stays human-readable and branch-identifiable:
`{BRANCH_CODE}-{YYYYMMDD}-{daily seq, 4 digits}` — e.g. `MNLA-20260925-0001`.
The daily sequence is a per-`(branch_id, date)` counter incremented
atomically inside `commit_sale` (a `sale_sequences` table with a row-level
lock, or a Postgres sequence reset logic) — never derived from
`count(*)` (races) and never from the client's clock.

---

## 8. Realtime

Subscribe to `stock_balances` filtered by the viewer's branch (Inventory,
POS catalog) and to `sales` filtered by branch (Sales log, live dashboard).
Owner/multi-branch views subscribe unfiltered. A manager's combined
dashboard should visibly update within roughly a second of a sale landing
at either branch — that's the entire point of this migration.

---

## 9. What replaces the Vite app's local-only mechanisms

| Vite app had | Becomes |
|---|---|
| IndexedDB / LocalStorage snapshot | Supabase Postgres, RLS-scoped |
| Single reducer, one atomic local state | The RPCs in §6 — same "one atomic transition" principle, now server-side |
| Single-tab `BroadcastChannel` lock | **Deleted.** Concurrent cashiers are now correct and desired, not a hazard, once writes go through atomic RPCs with a unique `receipt_no`. Do not port this mechanism. |
| `prefs.cashier` in LocalStorage | Real login (Supabase Auth) — the cashier is the signed-in user, not a picked name |
| Client-generated receipt number | Server-generated, §7 |
| Print / receipt download | **Unchanged.** Still a browser-local concern; port `Receipt.jsx`, `PrintCenter.jsx`, and `platform.js`'s print/download logic as-is. |

---

## 10. Migration plan — port, don't rebuild

The Vite app (`herbal-pos-source.zip`) is a fully built, tested UI. Unzip it
next to this new repo (e.g. `./legacy-vite-app/`) so Claude Code can read
it directly while porting. Reuse, adapted for Next.js App Router:

- **Design system as-is:** `src/index.css` (every color token, light + dark),
  `tailwind.config.cjs`, the Atkinson font packages. The look should not
  change.
- **Pure logic as-is, just imported:** `lib/format.js`, `lib/pricing.js`
  (client-side preview math can stay for instant UI feedback, but the
  *authoritative* calculation on save is always the RPC's server-side
  recompute), `lib/periods.js`.
- **Components, adapted:** `components/ui.jsx`, `components/Receipt.jsx`,
  `components/PrintCenter.jsx`, `components/ProductForm.jsx` port with
  minimal change (swap any direct `dispatch` calls for calls into a new
  Supabase-backed data layer with the same shape).
- **Rebuilt, not ported:** `lib/reducer.js`, `lib/storage.js`,
  `lib/tablock.js`, `lib/draft.js`'s persistence half — these exist
  entirely to work around having no server, and cloud/schemas replace them
  the modules themselves (`PosModule.jsx` etc.) port their *layout and
  interaction* code but call the new data layer instead of `useApp()`'s
  local dispatch.

---

## 11. Resilience, not full offline

Do **not** build offline-first sync (CRDTs, local queue-and-replay) for v1
— that's a large scope jump for a "sometimes the wifi blips" problem. Build
instead: if `commit_sale` fails on a network error, keep the draft exactly
as typed, show a clear "not saved — check connection" state with a retry
button, and never clear the ticket until a save actually succeeds. Revisit
true offline support only if outages turn out to be frequent in practice.

---

## 12. Cost (same bands as the AurumSpa precedent)

Development: Supabase free tier + Vercel Hobby — plenty for building and a
soft launch. **Before real commercial use**, move to Vercel Pro ($20/mo) —
Hobby's terms are personal/non-commercial use only — and Supabase Pro
($25/mo) once past the free tier's limits (500 MB DB / 50k MAU / 2 GB
egress, all generous for two tills). Budget **~$45/mo** at production,
same number as AurumSpa.

---

## 13. Suggested repo structure

```
herbal-pos-cloud/
├── app/
│   ├── (auth)/login/
│   ├── (app)/
│   │   ├── pos/
│   │   ├── sales/
│   │   ├── inventory/
│   │   ├── stock/
│   │   ├── reports/
│   │   ├── products/
│   │   └── options/
│   └── api/                 # only if a server route is genuinely needed
├── components/               # ported from the Vite app, adapted
├── lib/
│   ├── supabase/             # server + browser clients
│   ├── rpc/                  # typed wrappers over the Postgres functions
│   └── format.js, pricing.js, periods.js   # ported as-is
├── supabase/
│   ├── migrations/           # schema + RLS + triggers + the 4 RPCs
│   └── seed.sql              # the same seed catalog as the Vite app
├── types/                    # generated from the Supabase schema
├── CLAUDE.md
└── SPEC.md                   # this file
```

---

## 14. Definition of Done — Phase 1

- [ ] Auth working; `profiles.role` + `branch_id` enforced by RLS on every table
- [ ] Both branches seeded, both logged into from two different sessions at once with no lock screen, no collision
- [ ] POS: full parity with the Vite app's ticket, pricing, and package-deduction behavior
- [ ] `commit_sale` / `void_sale` / `receive_stock` / `reverse_stock_in` all atomic, all tested with two simultaneous callers
- [ ] Receipt numbers collision-free under concurrent saves (test it — fire two at once on purpose)
- [ ] Inventory and Sales log update live (realtime) when the *other* branch or a second tab makes a change
- [ ] Reports correctly separate per-branch vs. all-branch for the owner role
- [ ] Printing and the blocked-print → download fallback both still work, ported unchanged
- [ ] A killed network connection mid-save never loses the ticket (§11)
