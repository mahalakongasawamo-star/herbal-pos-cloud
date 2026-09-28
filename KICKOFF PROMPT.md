Read `CLAUDE.md` and `SPEC.md` in this repo root before doing anything
else. `./legacy-vite-app/` has the existing, working POS app — read its
`src/` before writing any new UI code; most of the design and component
layer ports over, per `SPEC.md` §10. Don't build from a blank page.

We're doing Phase 0 only in this session: get the foundation in place and
running, then stop for review before Phase 1. Concretely, in order:

1. Scaffold: `npx create-next-app@latest .` (App Router, TypeScript,
   Tailwind, no `src/` directory — match the structure in `SPEC.md` §13).
2. Port the design system from `./legacy-vite-app/src/index.css` and
   `tailwind.config.cjs` — same color tokens (light + dark), same Atkinson
   fonts. The app should look identical to the Vite version once styled.
3. Supabase: `supabase init`, then either link to a project I've already
   created (ask me for the project ref and anon/service keys if I haven't
   given them yet) or walk me through creating one — don't guess at
   credentials.
4. Write the schema migration: every table in `SPEC.md` §3, in the order
   given (branches → profiles → categories → products →
   package_inclusions → member_tiers → payment_methods → stock_ledger →
   stock_balances → stock_ins → sales → sale_items). Include the trigger
   that keeps `stock_balances` in sync with `stock_ledger` inserts.
5. Write RLS policies for the three roles in `SPEC.md` §2. Test each role
   can and cannot do what the table says, in this session, before moving on.
6. Write the four RPCs in `SPEC.md` §6 (`commit_sale`, `void_sale`,
   `receive_stock`, `reverse_stock_in`) plus the receipt-number sequence
   logic in §7. These are the highest-risk part of this whole migration —
   don't skip writing a quick test that fires `commit_sale` twice
   concurrently and confirms no duplicate receipt number and no
   over-selling of stock.
7. `seed.sql`: same starting catalog as the Vite app's `src/lib/seed.js`
   (all the Entry Packages, Health Drink, Organic Coffee, Organic Powder,
   Organic Rub, Oils, and Liquid products — copy it exactly, prices at ₱0
   and tier discounts at 0%, matching what's already live). Seed both
   branches (`MNLA`, `BAGUIO`).
8. Wire up Supabase Auth: a login page, and one seed user per role (owner,
   one manager, one cashier per branch) so I can actually log in and look
   around.
9. Empty shell pages for every route in `SPEC.md` §13's `app/(app)/` list —
   don't build the real screens yet, just prove the routing, auth guard,
   and layout (nav rail, header) work end to end.

**Stop here.** Show me it running locally (`npm run dev`), logged in as
each of the three seed users, with the schema and RLS policies applied.
Don't start Phase 1 (the actual POS/Inventory/Reports screens) until I've
looked at this and said go.
