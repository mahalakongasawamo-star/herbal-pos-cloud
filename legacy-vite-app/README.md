# Herbal POS — point of sale and inventory

React + Tailwind point-of-sale and inventory app for Dok Honey's Tibicos and the
rest of the herbal/MLM catalog (entry packages, coffee, powders, rubs, oils,
liquids). Everything — sales, stock, prices, options — is saved in the
browser you run it in (IndexedDB, with a LocalStorage fallback).

**Read this first:** each browser/device keeps its own data. Manila and
Baguio running this on two separate devices will **not** share one
inventory — see "Storage, and its limit" below before you rely on this for
more than one till.

## Quick start

```bash
npm install
npm run dev
```

Opens a dev server (Vite will print the local URL, typically
`http://localhost:5173`). Hot-reloads as you edit `src/`.

## Build a deployable site

```bash
npm run build
```

Outputs a static site to `dist/` — upload it to any static host (Netlify,
GitHub Pages, an internal server, or just the branch PC's local web server).
Preview the production build locally with `npm run preview`.

## Build a single offline HTML file

```bash
npm run build:single
```

Outputs to `dist-single/`:

- **`pos.html`** — loads React from a CDN (cdnjs, with a jsDelivr fallback).
  Smallest file; needs an internet connection once to load React.
- **`pos-offline.html`** — React is embedded in the file. No internet
  connection needed at all. Best for a till PC, a USB stick, or anywhere you
  want zero dependency on connectivity. This is the one to hand to a cashier
  station that should just work by double-clicking it.

Both are a single `.html` file — no server, no build step, no install.
Double-click to open in a browser.

## Storage, and its limit

Sales, stock, prices and settings are stored **in the browser**, on the
device you're using — not in any shared account or server. That means:

- Data survives closing the tab, reloading, and restarting the browser.
- Opening the POS in a second tab shows a "this is open elsewhere" screen so
  two tabs can't overwrite each other's sales — only one tab runs the
  register at a time.
- **Manila and Baguio, on separate devices, each get their own inventory and
  sales log.** There is no shared count between them. If you need one shared
  inventory across branches, this needs a real backend (Postgres/Supabase is
  a natural next step — the Options → Data and backup export already uses
  the same shape of data a Supabase schema would use).
- Clearing a browser's site data (or a fresh device) erases everything on
  that device. **Export a backup at the end of each day**: Options → Data
  and backup → Export backup. Import restores from that file.

## Project layout

```
src/
  lib/           Pure logic: pricing rules, the reducer (every state change
                 goes through it), storage, formatting, periods for reports.
  components/    Shared UI (buttons, modal, receipt) used by every module.
  modules/       The 7 screens: POS, Sales log, Inventory, Add stock,
                 Reports, Product master, Options — plus the Setup guide.
  App.jsx        Shell: navigation, persistence, tab-lock, print orchestration.
scripts/
  build-single.mjs   Bundles everything into the single HTML files above.
```

## Notes on the numbers

- Every price starts at **₱0** and every member-tier discount starts at
  **0%**, exactly as specified. Set real prices in **Product master** and
  real discounts in **Options** before using this for a real sale — Product
  master flags any product still at ₱0.
- Member pricing checks, in order: a tier-specific price on the product, then
  the product's member price, then retail minus the tier's discount %. New
  customers always pay retail.
- Entry packages aren't stock items — selling one deducts its contents (e.g.
  the Manager Package deducts 14 × Dok Honey's Tibicos) from real inventory.

## Printing

Printing calls the browser's own print dialog (A4, customer copy + cashier
copy on one sheet). If a receipt's Print button can't reach the print dialog
— which can happen inside a sandboxed viewer — it automatically offers a
"Download receipt" file instead; opening that file in a normal browser tab
prints itself. For daily counter printing, run the site normally (this
build, or your own hosting) rather than inside an embedded viewer.
