# STATUS

Build of the herbal/MLM POS + inventory app from the master-prompt spec.
State as of this handoff: **feature-complete against the spec, functionally
tested, not yet used in a real shift.**

## What's built

All 7 modules + the setup guide, per the spec:

1. **POS** — customer profile (name, leader, upline, customer tier, member
   tier), live clock, catalog with search/category filters, order ticket,
   member pricing, cash validation, package deduction, save/print/new.
2. **Receipt** — dual copy (customer + cashier) on one A4 sheet, stacked or
   side-by-side layout, prints from the POS or from any row in the Sales log.
3. **Sales log** — search, cashier/date filters, void toggle, CSV export,
   pagination.
4. **Inventory** — status filter chips (in/low/out), sortable columns, CSV
   export. Packages are intentionally excluded (they're not stock items).
5. **Add stock** — single receive (with inline new-product registration),
   bulk receive grid, register-new-product form, history with per-entry undo.
6. **Reports** — Daily/Weekly/Monthly/Yearly with prev/next navigation, KPIs,
   a trend chart, payment-method and cashier splits, top 5 products, top
   packages (+ what they released into stock), top leaders/uplines by
   revenue. Void sales are excluded everywhere.
7. **Product master** — inline-editable retail/member prices and reorder
   levels, per-tier price overrides, package contents editor, archive
   toggle, add/edit modal.
8. **Options** — store/receipt details + logo + print layout, cashiers,
   payment methods (with "gives change"), member tiers + discount % (with
   reordering), and Data & backup (export/import JSON, storage-used
   estimate, "protect storage" request, full reset with type-to-confirm).
9. **Setup guide** — drawer with a live 4-item checklist (store details,
   prices, opening stock, options reviewed) plus full walkthroughs; opens
   automatically on first run.

Cross-cutting: single reducer (every mutation — sale, void, stock receive/
reverse, product edit — is one atomic transition), IndexedDB-first storage
with LocalStorage fallback and a memory-only last resort, single-active-tab
lock via BroadcastChannel, light/dark theme tokens, mobile-first responsive
layout, custom toast/confirm/modal/drawer (no native `alert`/`confirm`).

## Verified (this session, headless Chromium via Playwright)

- Set retail prices in Product master (inline edit, Enter/Tab to commit).
- Bulk-received stock; numbers reflected immediately in Inventory.
- POS sale as a Member/Manager-tier customer, 1× Manager Package: ticket
  correctly shows "Deducts 14× Dok Honey's Tibicos"; total ₱1,800.00 with the
  configured 0% tier discount (i.e. no silent discount applied).
- Save → "Sale saved" state locks the ticket; Inventory drops to 36 (50 − 14).
- Receipt modal (opened from Sales log): shows the package inclusion line,
  customer + leader names; "Download receipt" produces a real, self-printing
  HTML file.
- Void: reason required; stock restored to 50; sale stays in the log flagged
  Void and drops out of Reports.
- **Reload persistence**: stock and the voided sale both survive a full page
  reload (confirms the IndexedDB snapshot read/write path).
- **Two-tab lock**: second tab shows "open in another tab"; "Use here"
  correctly hands control over and the first tab shows "moved to another
  tab".
- Dark mode and a 390px mobile viewport both render with no horizontal
  overflow and no console errors anywhere in the above.
- `npm run build` (Vite) and `npm run build:single` (esbuild) both verified
  to complete cleanly from a fresh `npm install`.

Not yet exercised: a real print dialog (headless Chromium accepts
`window.print()` without a dialog, so the "blocked → offer download" branch
only got a code review, not a live trigger), the Import-backup restore path,
and multi-day / multi-year Reports data (tested with a single day's data).

## Known gaps / things to decide next

- **Storage is per-browser, per-device.** This is the biggest thing to flag
  to the client: Manila and Baguio will not share one inventory or sales log
  on separate devices. Said plainly in the README and in the reply. The
  export/import JSON shape is deliberately close to what a Supabase schema
  would need, to make that migration straightforward later.
- No sticky total/save bar on mobile — on a long product list you scroll
  past the total before reaching Save. Low effort to add (a `sticky bottom-0`
  strip mirroring the desktop pole display) if this becomes the primary
  mobile experience rather than a desktop-first till.
- No authentication / no distinction between cashier "login" and just
  picking a name from a list — matches the spec (cashier is a dropdown, not
  an account), but worth confirming that's acceptable for the real rollout.
- The receipt logo placeholder and default company name are still the
  generic defaults until someone fills in Options.
- No automated test suite committed (this session's Playwright scripts were
  ad hoc, run against the built HTML, not saved into the repo). Worth adding
  a `tests/` folder with Playwright if this keeps evolving.

## Suggested next steps, in order

1. Use it for a real shift or two on one device, export a backup daily.
2. Decide if/when to move to a shared backend (Supabase/Postgres) — needed
   the moment two branches must see the same stock number.
3. If mobile becomes primary (not just a backup to a desktop till), add the
   sticky mobile total bar.
4. Add real product photos / a real logo via Options once available.
