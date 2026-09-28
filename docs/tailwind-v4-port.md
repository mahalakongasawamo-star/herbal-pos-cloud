# Tailwind 3.4 to 4 porting checklist

This is the Phase 1 reference for moving class strings from the Vite app
(`legacy-vite-app/`, Tailwind 3.4.19) into this app (Tailwind 4.3, Next 16).
The rule from SPEC.md §10 is that the look must not change.

All paths below are relative to `legacy-vite-app/src/`. Line numbers refer to
that read-only copy.

## The short version

Copy every legacy class string byte-for-byte, with three exceptions:

1. Replace `outline-none` with `outline-hidden`, including under `focus:` and
   `focus-visible:`. There are 19 uses. See [§1](#1-renames-change-these).
2. Replace `shadow` with `shadow-sm`. There is 1 use. See §1.
3. Add the `!` suffix to three caller overrides whose winner flips in v4:
   `text-lg!` (PosModule.jsx:886), `h-9!` (Reports.jsx:138) and `text-xs!`
   (Options.jsx:457). See [§2](#2-conflicting-classes-whose-winner-flips-change-these).

`app/globals.css` already handles the rest in one place:

- the 28 colour tokens and dark mode
- `text-xl` and the line heights of every named text size
- `hover:` on touch screens
- the breakpoints
- the v3 browser-default resets (preflight) that the markup relies on

These are covered in [§4](#4-same-class-different-v4-default-already-handled-in-appglobalscss) and [§5](#5-preflight-differences).
Don't "fix" those classes in components. Any class not named in this document
compiles to the same CSS in v4 as it did in v3. [§9](#9-how-this-list-was-made) describes how that was checked.

---

## 1. Renames: change these

| Legacy (v3) | Write in v4 | Why | Where |
|---|---|---|---|
| `outline-none` | `outline-hidden` | v3 `outline-none` was `outline: 2px solid transparent; outline-offset: 2px`, an invisible outline that Windows High Contrast still paints. v4 `outline-none` is `outline-style: none`, which removes it entirely. v4 `outline-hidden` is the old behaviour. | components/ui.jsx:337 (Modal panel), 372 (Drawer panel) |
| `focus:outline-none` | `focus:outline-hidden` | Same as above. | components/ui.jsx:60 (`inputCls`); modules/AddStock.jsx:255; modules/Options.jsx:217; modules/PosModule.jsx:673; modules/ProductMaster.jsx:33 |
| `focus-visible:outline-none` | `focus-visible:outline-hidden` | Same as above. | App.jsx:236, 290, 310, 336; components/ui.jsx:11 (`BTN_BASE`), 45 (IconButton), 149 (Segmented), 176 (Toggle); modules/Inventory.jsx:25, 120; modules/PosModule.jsx:571, 635 |
| `shadow` | `shadow-sm` | v4 moved the shadow scale down one step, so v4 `shadow-sm` equals v3 `shadow` (`0 1px 3px 0 rgb(0 0 0/.1), 0 1px 2px -1px rgb(0 0 0/.1)`). A bare `shadow` still compiles to that value in 4.3, but it is deprecated. | components/ui.jsx:180 (Toggle knob) |

No other v4 renames apply. [§7](#7-checked-not-used-anywhere-in-legacy) lists the ones that were checked and found unused.

---

## 2. Conflicting classes whose winner flips: change these

When two classes on one element set the same property, the one that comes
**later in the generated stylesheet** wins. Its position in the `class`
attribute doesn't matter. The legacy components join a base string with the
caller's `className`, for example `cx(inputCls, className)` and
`cx(BTN_BASE, BTN_SIZE[size], BTN_VARIANT[variant], className)`. As a result,
some elements carry two heights or two font sizes. v3 and v4 order the
stylesheet differently:

- **v3.4** sorted class names as plain strings before generating rules. Within
  one utility, the alphabetically later name won: `'h-9' > 'h-11'` and
  `'text-lg' > 'text-[15px]'`, because `[` sorts before letters.
- **v4** sorts by property first. It then puts rules with more declarations
  first, and finally compares names with numbers read as numbers, so `h-9` <
  `h-11`. Named font sizes set two declarations (font-size and line-height),
  while `text-[15px]` sets one. So an arbitrary size now beats a named one.

Every composed class list in legacy was checked ([§9](#9-how-this-list-was-made)). Three winners flip:

| Where | Element | Conflict | v3 rendered | Plain v4 would render | Port as |
|---|---|---|---|---|---|
| modules/PosModule.jsx:879-886 | Cash tendered `<Input className="num pl-8 text-lg font-bold">` | `inputCls` `text-[15px]` vs `text-lg` | `text-lg` (18px / 1.75rem) | 15px | `num pl-8 text-lg! font-bold` |
| modules/Reports.jsx:138 | Cashier location `<Select className="h-9">` | `inputCls` `h-11` vs `h-9` | `h-9` (36px) | 44px | `h-9!` |
| modules/Options.jsx:457 | Setup text `<Textarea className="h-72 font-mono text-xs">` | `inputCls` `text-[15px]` vs `text-xs` | `text-xs` (12px) | 15px | `h-72 font-mono text-xs!` |

`!` is v4's important modifier, which goes after the class name (v3 put it
before). `text-lg!` and `text-xs!` still let a `leading-*` class on the same
element set the line height, just as v3 did. v4 emits `line-height:
var(--tw-leading, …) !important`, and `leading-snug` sets `--tw-leading`.
That matters for the Textarea, whose base class includes `leading-snug`.

If Phase 0's `components/ui.tsx` changed a base string or the order of
concatenation, re-check these rows against it.

### Keep dead overrides dead

These caller classes lose to the component's base class in v3 *and* in v4, so
they have never had a visible effect. Port them unchanged. Don't add
`tailwind-merge` or `twMerge`, and don't reorder the concatenation to "fix"
them, because that would change the look:

| Where | Caller class (never applied) | Loses to |
|---|---|---|
| components/ProductForm.jsx:173-176 | `w-20` (package-item qty `<Input>`) | `w-full` (`inputCls`) |
| modules/AddStock.jsx:207 | `w-24` (bulk "fill blank rows" `<Input>`) | `w-full` (`inputCls`) |
| modules/Inventory.jsx:180 | `text-ink-2` on `<Sku>` | `text-muted` (Sku base) |
| modules/Options.jsx:457 | `h-72` on `<Textarea>` | `h-auto` (Textarea base). The box stays at `min-h-[88px]`. |
| modules/PosModule.jsx:311-317 | `h-10` on the cashier `<Select>` | `h-11` (`inputCls`) |
| modules/PosModule.jsx:894 | `px-3` on the quick-cash `<Button>` | `px-4` (Button `md`) |
| modules/ProductMaster.jsx:242 | `px-2` on the "Set" tier-price `<Button size="sm">` | `px-3` (Button `sm`) |

For the same reason, an `invalid` field **never turns red** in legacy, and
it won't in the port. The invalid classes all lose to the base `inputCls`
colours in both versions:

- `border-bad` loses to `border-line-strong`.
- `focus:border-bad` loses to `focus:border-leaf`.
- `focus:ring-bad/25` loses to `focus:ring-leaf/30`.
- The same happens with `border-bad` on `Select` (ui.jsx:106) and with
  `border-bad/70` on an unselected `Segmented` option (ui.jsx:152).

The visible error cue is the red message under the field. This is inherited
behaviour. Keep it, and raise it as a separate design change if it should be
fixed.

---

## 3. Custom classes from legacy index.css: keep as-is

| Class | In app/globals.css | Used at |
|---|---|---|
| `num` | `@utility num` (`font-variant-numeric: tabular-nums`). Variants work on it. | About 50 uses: App, ProductForm, AddStock, Inventory, Options, PosModule, ProductMaster, Reports, SalesLog, SetupGuide |
| `pb-safe` | `@utility pb-safe` (1rem plus the bottom safe area). It sorts after `p-*`, `py-*` and `pb-*`, so it still wins over them, as in v3. | components/ui.jsx:351 (Modal footer), 380 (Drawer body) |
| `pole-figure` | Plain CSS (counter-display glow) | modules/PosModule.jsx:842, 851 |
| `receipt-edge` | Plain CSS (`position: relative`) | modules/PosModule.jsx:825 |
| `toast-region`, `toast-in` | Plain CSS plus `@keyframes toast-in` | components/ui.jsx:408, 412 |
| `drawer-panel` | Plain CSS plus `@keyframes drawer-in` | components/ui.jsx:372 |
| `pole` | Nothing. It had no CSS in legacy either, so it is a dead class. | modules/PosModule.jsx:839. Port it or drop it; it has no visual effect. |
| `rc-*` | Not in globals.css. These are the `RECEIPT_CSS` / `PRINT_PAGE_CSS` strings in components/Receipt.jsx, injected by `<style>` at App.jsx:209. They are plain CSS that doesn't depend on Tailwind. Port them unchanged. | components/Receipt.jsx |
| `#print-root` | `#print-root { display: none }`. When printing, `PRINT_PAGE_CSS` shows it and hides every other child of `<body>`. | components/PrintCenter.jsx:14 |

The plain component classes are **unlayered** in globals.css. In v3 they came
after the utilities in one unlayered sheet and won ties. Unlayered CSS beats
every v4 layer, so they still win over a utility that sets the same property.

Keep PrintRoot, Modal, Drawer and the toast region portaling to
`document.body`. `app/layout.tsx` renders the app inside `<div id="root">`
(same as the Vite `index.html`) so that `body > *:not(#print-root)` still
hides the app and nothing else when printing, and `h-full` screens fill the
viewport.

---

## 4. Same class, different v4 default: already handled in app/globals.css

Don't change these classes. The fix lives in one place.

| What changed in v4 | v3 | Plain v4 | globals.css does | Affected classes |
|---|---|---|---|---|
| Line height of named sizes | Paired with each size in rem (`text-sm` = 0.875rem / **1.25rem**) | Unitless ratios (`calc(1.25 / 0.875)`). The computed value on the element is the same, but it is inherited as a ratio, so a child that changes only its font size gets a different line box. | Restores v3's rem values in `@theme`: `--text-xs\|sm\|base\|lg\|2xl\|3xl\|4xl--line-height` | `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-2xl` (121 uses). A proven case is PageHeader's `<h1 className="text-2xl … sm:text-[28px]">` (components/ui.jsx:248): its line box is 32px in v3 and would be 37.3px with v4's ratio. |
| `text-xl` | Overridden in tailwind.config.cjs to 1.3125rem / 1.75rem | 1.25rem / ratio | `--text-xl: 1.3125rem; --text-xl--line-height: 1.75rem` | App.jsx:353; components/ui.jsx:375; main.jsx:25; modules/PosModule.jsx:847 |
| `hover:` and `group-hover:` | Plain `:hover`, so a tap on a touch screen shows it | Only inside `@media (hover: hover)`, so it never shows on touch-only tills | `@custom-variant hover (&:hover);` restores v3 (delete that one line to opt into v4's behaviour) | 18 classes: App.jsx:237, 291, 310; components/ui.jsx:19-24, 46, 151, 153; modules/Inventory.jsx:25, 121; modules/PosModule.jsx:542, 572, 636, 637; modules/ProductMaster.jsx:161, 255; modules/Reports.jsx:219 (`group-hover:bg-turmeric`); modules/SalesLog.jsx:183 |
| Breakpoints `sm: md: lg: xl: 2xl:` | `min-width: 640px / 768px / 1024px / 1280px / 1536px` | The same values in rem, which move when a cashier enlarges the browser's font size | `--breakpoint-*` set back to v3's px | 113 uses, 49 classes, in App, PrintCenter, ProductForm, ui, AddStock, Inventory, Options, PosModule, ProductMaster, Reports, SalesLog |
| Colour opacity `/NN` | `rgb(var(--x) / 0.NN)` | `color-mix(in oklab, rgb(var(--x)) NN%, transparent)` | Nothing needed. The result is the same colour at the same alpha. See the browser note in [§8](#8-rules-for-new-markup). | `bg-ink/35`, `bg-ink/45`, `bg-leaf-soft/50`, `bg-leaf/70`, `bg-sunken/60`, `bg-sunken/70`, `border-bad/30`, `border-bad/40`, `border-bad/70`, `border-display-dim/25`, `border-leaf/70`, `border-ok/30`, `border-turmeric/60`, `border-warn/40`, `border-white/10`, `focus:ring-bad/25`, `focus:ring-leaf/30`, `hover:bg-sunken/60`, `hover:bg-white/10`, `hover:border-leaf/50`, `placeholder:text-turmeric-ink/70`, `text-leaf-ink/80`, at App.jsx:276, 291, 306, 310; PrintCenter.jsx:79, 88; ui.jsx:60, 98, 152, 329, 365; AddStock.jsx:240, 255; Options.jsx:217, 424; PosModule.jsx:352, 636, 673, 742, 844, 909; ProductMaster.jsx:33, 34, 219; Reports.jsx:204, 264; SalesLog.jsx:183; SetupGuide.jsx:82 |
| Colour tokens | `rgb(var(--x) / <alpha-value>)` in tailwind.config.cjs | No config file | `@theme inline { --color-<token>: rgb(var(--<token>)) }` for all 28 tokens. The three `:root` blocks are copied verbatim. | Every `bg-*`, `text-*`, `border-*`, `ring-*`, `divide-*` and `placeholder:text-*` that uses a token |
| Fonts | `fontFamily.sans` / `mono` in the config | Geist or system stacks | `--font-sans` / `--font-mono`, same stacks in the same order. Fonts are imported in app/layout.tsx, as in main.jsx. | `font-mono`: ProductForm.jsx:110; ui.jsx:224; AddStock.jsx:101; Options.jsx:457; PosModule.jsx:289; SalesLog.jsx:185. It is also the default for `<pre>`/`<code>`, as in v3. |

Dark mode is driven entirely by the token variables: the OS preference, or
`data-theme="dark"` / `"light"` on `<html>`. Legacy has **no `dark:`
variants** and never sets `data-theme`, and neither should the port. v4's
`dark:` would follow only the media query, not `data-theme`.

Every `/NN` opacity modifier in legacy is a multiple of 5, which v3.4's
opacity scale supports. v4 accepts any integer, so a `/12` that v3 silently
dropped would start working in new code. The same applies to spacing: every
spacing step used in legacy is in v3's scale.

---

## 5. Preflight differences

Preflight is Tailwind's set of browser-default resets. The rules marked
"compat" are in the commented `v3 preflight compatibility` block (`@layer base`)
in app/globals.css. That block sits under the utilities, so any utility on an
element still wins, as in v3.

| Topic | v3 preflight | v4 preflight | Status | Legacy elements |
|---|---|---|---|---|
| Default border colour | `#e5e7eb` (gray-200) on every element | `currentColor` | **compat**, as a safety net | Today, none depend on it. All 72 border-width uses (`border`, `border-t`, `border-b`, `xl:border-l`) and the 3 `divide-y` lists name a token colour on the same element (checked per element, ternary branches included). The rule is there so that a ported or new `border` without a colour still looks like v3. |
| Placeholder colour | `#9ca3af` (gray-400) | 50% of the text colour | **compat** | modules/AddStock.jsx:252-257 (bulk-grid qty cells, `placeholder="0"`, no `placeholder:` utility). All other placeholders set `placeholder:text-*` (ui.jsx:59, ProductMaster.jsx:33-34). |
| Button cursor | `button, [role=button] { cursor: pointer }` and `:disabled { cursor: default }` | Browser default (arrow) | **compat** | All 17 raw `<button>` elements and every `Button`, `IconButton`, `Segmented` and `Toggle`. Only ProductMaster.jsx:139 (`<summary>`) sets `cursor-pointer` itself. |
| `type="search"` | `-webkit-appearance: textfield; outline-offset: -2px` | Removed | **compat** | Inventory.jsx:136, PosModule.jsx:551, ProductMaster.jsx:173, SalesLog.jsx:110. The cancel-button cursor rule from index.css is also kept. |
| Form-control opacity | Browser default (Safari dims disabled fields) | Forced to `opacity: 1` | **compat** (`opacity: revert`) | Disabled fields with no `disabled:opacity-*`: PosModule.jsx:311 (cashier Select), 392/404/415 (customer Inputs), 549 (search), 672 (QtyInput); AddStock.jsx:129, 145 |
| Date/time internals and the datalist marker | Browser default | v4 retunes `::-webkit-datetime-edit*`, `::-webkit-date-and-time-value` and `::-webkit-calendar-picker-indicator` | **compat** (`revert`) | Date inputs: AddStock.jsx:85, 200; SalesLog.jsx:141, 144. Datalist inputs: PosModule.jsx:394, 406, 417; AddStock.jsx:97. |
| input/select/textarea background | Browser default (only buttons were transparent) | Transparent | Not needed | Every legacy field sets `bg-*`: `inputCls` `bg-surface`; raw inputs AddStock.jsx:255, Options.jsx:217, PosModule.jsx:673, ProductMaster.jsx:33-34 |
| Form-control border radius | Browser default | 0 | Not reverted | Every field has `rounded-*`. The only buttons without one are the sort headers at Inventory.jsx:22 and the text-link buttons at ProductMaster.jsx:161, 255. The only possible difference is the corner of their focus ring on Safari. |
| `* { margin: 0; padding: 0 }` | v3 reset only listed elements, not `td`/`th` (1px browser padding), `<dialog>` or `<option>` | Resets every element | Not needed | Every `td`/`th` sets both padding axes (tables at AddStock.jsx:225, 351; Inventory.jsx:163; PosModule.jsx:759; ProductMaster.jsx:198; SalesLog.jsx:166). The receipt's cells use explicit `.rc-items` padding. There is no `<dialog>`: Modal and Drawer are `role="dialog"` divs. `fieldset`/`legend` (ProductForm.jsx:155-156) were reset by both. |
| `[hidden]` attribute | `display: none` | `display: none !important` | Not needed | Only ui.jsx:506 (hidden submit button, no display class) |
| `::file-selector-button` | Native button look | Stripped | Not needed | Both file inputs use `className="hidden"` behind a Button (Options.jsx:78, 412) |
| `ring` defaults | Width 3px, colour `rgb(59 130 246 / .5)` | Width 1px, `currentColor` | Not needed | All 17 `ring-2` uses name a colour (`ring-leaf`, `ring-turmeric`, `ring-leaf/30`, `ring-bad/25`), and bare `ring` isn't used |
| Tap highlight, `html` line-height 1.5, headings/lists/links reset, `img` block | Same in v3 and v4 | Same | Nothing to do | n/a |

---

## 6. Changed in v4, verified harmless for this markup

No action needed. Keep these in mind when changing the markup.

- **`space-y-*`**, 15 uses: ProductForm.jsx:81, 157; Options.jsx:57, 341;
  PosModule.jsx:253, 857, 913; ProductMaster.jsx:88, 142, 144;
  Reports.jsx:239, 262; SetupGuide.jsx:13, 20, 80.
  - v3 put `margin-top` on every child except the first, with a
    high-specificity selector that beat the child's own `mt-*`.
  - v4 puts `margin-bottom` on every child except the last, inside
    `:where()`, so it has zero specificity.
  - The two differ only if a direct child has its own vertical margin, is
    hidden by a class, or is an absolutely positioned last child. None of the
    15 containers has such a child.
  - If a ported list gains conditional or absolute children, check it. For
    new code, prefer `flex flex-col gap-*`.
- **`divide-y divide-line`** (Options.jsx:125, 167, 264): v3 drew a top
  border on every item except the first; v4 draws a bottom border on every
  item except the last. The pixels are the same while every `<li>` is visible,
  which they always are.
- **`translate-x-0.5`, `translate-x-[22px]`, `-translate-y-1/2`**
  (ProductForm.jsx:214; ui.jsx:180; Inventory.jsx:135; Options.jsx:227;
  PosModule.jsx:310, 548, 878; ProductMaster.jsx:172; SalesLog.jsx:109):
  v4 uses the CSS `translate` property instead of `transform`, and the
  position is the same. v4's `transition-transform` (ui.jsx:180, the Toggle
  knob) includes `translate`, so the knob still slides. Don't mix these with
  an inline `style={{ transform }}` and expect v3's composition.
- **`transition-colors`** (App.jsx:289; ui.jsx:10, 45, 149, 176;
  Inventory.jsx:120; PosModule.jsx:571, 634; Reports.jsx:219): v4 also
  transitions `outline-color` and gradient stops. This isn't visible here.
- **`shadow-xl`, `shadow-2xl`** (ui.jsx:337, 372, 412): same values as v3.
- **`shadow-inner`** (PrintCenter.jsx:103): still valid in 4.3 with v3's
  value, so keep it. The new v4 name, `inset-shadow-sm`, gives the same
  pixels.
- **`rounded-full`**: now `calc(infinity * 1px)` instead of 9999px, which
  looks the same.
- **`flex-1`**: now `flex: 1`, which computes to `1 1 0%`, the same as v3.
- **`sr-only`**: now uses `clip-path` instead of `clip`, with the same effect.
- **`break-words`** (ui.jsx:416): still `overflow-wrap: break-word`.
- **`bg-white`, `text-white`, `border-white/10`, `hover:bg-white/10`**
  (App.jsx:263, 276, 291, 297, 306, 310; PrintCenter.jsx:103;
  Options.jsx:75): white is still `#fff`. It is the only default-palette
  colour legacy uses, so v4's OKLCH palette never comes into play.
- **Stacked variants** `disabled:hover:*`, `read-only:*` and `placeholder:*`
  (ui.jsx:19-21, 59-60): v4 reads variants left to right, while v3 read them
  right to left. For these pseudo-class stacks the selector is the same.
- **Arbitrary values** such as `grid-cols-[minmax(0,1fr)_…]`, `max-w-[70ch]`,
  `text-[15px]` and `z-[60]` use the same syntax and produce the same output.
- **Unchanged** utilities include `line-clamp-2`, `truncate`,
  `animate-pulse`, `select-none`, `sticky`, `list-decimal`,
  `underline-offset-2`, `object-contain`, `tracking-tight`, all `leading-*`,
  all `font-*` weights, `max-w-sm|md|lg|xl|3xl|5xl`, and every spacing, size
  and `z-*` value used.

---

## 7. Checked: not used anywhere in legacy

Nothing to port. If you need one of these in new code, write the v4 form.

| v3 | v4 |
|---|---|
| `shadow-sm` | `shadow-xs` |
| `drop-shadow-sm` / `drop-shadow` | `drop-shadow-xs` / `drop-shadow-sm` |
| `blur-sm` / `blur`, `backdrop-blur-sm` / `backdrop-blur` | `blur-xs` / `blur-sm`, `backdrop-blur-xs` / `backdrop-blur-sm` |
| `rounded-sm` / `rounded` | `rounded-xs` / `rounded-sm` |
| bare `ring` (3px) | `ring-3`, always with a colour |
| `flex-shrink-*` / `flex-grow-*` | `shrink-*` / `grow-*` (legacy already uses `shrink-0`) |
| `bg-opacity-*`, `text-opacity-*`, `border-opacity-*` and similar | Slash modifiers (`bg-leaf/30`) |
| `!flex` (leading `!`) | `flex!` (trailing `!`) |
| `overflow-ellipsis` | `text-ellipsis` |
| `decoration-slice` / `decoration-clone` | `box-decoration-slice` / `box-decoration-clone` |
| `bg-gradient-to-r` | `bg-linear-to-r/srgb` (plain v4 gradients interpolate in oklab and look different) |
| `w-[--x]` (variable shorthand) | `w-(--x)` |
| `theme(colors.x)` in arbitrary values | `var(--color-x)` |
| `container` | Doesn't centre or pad by default in v4. Legacy uses `mx-auto max-w-[…]` instead. |
| `space-x-*`, `divide-x-*`, bare `outline`, `max-w-screen-*`, `dark:`, `print:`, `motion-reduce:` | Not used |
| Default palette colours (`gray-*`, `red-*`, …) | Not used. v4 redefined them in OKLCH, so use the tokens. |
| Dynamic class names (`` `bg-${x}` ``) | Not used, and don't start: the scanner can't see them |

---

## 8. Rules for new markup

- Colours come from the 28 tokens only. Adding a token means adding it to all
  three `:root` blocks **and** to `@theme inline` in globals.css.
- Always give `border*`, `divide-*` and `ring-*` a colour class. The
  gray-200 compat rule is a safety net, not a design choice, and v4 rings
  default to `currentColor`.
- Don't add `tailwind-merge`, and don't reorder `cx(base, className)` (see §2).
  If a caller really must beat a base class, use `!`.
- Avoid two classes that set the same property on one element. If you can't,
  remember v4's order from §2: arbitrary values beat named sizes.
- Keep portals on `document.body` and keep `#print-root` a direct child of
  `<body>` (see §3).
- **Browser floor.** v4 CSS needs Safari 16.4+, Chrome 111+ and
  Firefox 128+, because it relies on `@layer`, `@property` and `color-mix()`.
  The v3 build also ran on older browsers. On a browser without `color-mix()`,
  Lightning CSS's fallback draws every `/NN` colour solid, which would make
  the modal backdrop an opaque slab. Check the branch tills and phones before
  go-live.

---

## 9. How this list was made

1. **Extraction.** Tailwind's own scanner (`@tailwindcss/oxide`) extracted
   every candidate class from each `.js` / `.jsx` file in the legacy `src/`,
   with its position: 1,695 candidates in total.
   - With this `globals.css`, 422 of them compile as v4 utilities.
   - The rest are words, ids, aria attributes and the custom classes in §3.
   - No other legacy class failed to compile, so no utility that v4 removed
     is in use.
2. **Semantics.** All 422 were compiled with the v4 design system and
   compared against Tailwind 3.4's behaviour.
3. **Conflicts.** Every composed class list was checked for pairs that set
   the same property under the same variants. That covers `className`
   literals, `cx(...)` arguments, and props merged with the `ui.jsx` base
   strings, including `size`/`variant`. The v4 winner comes from the real
   `getClassOrder`; the v3 winner from 3.4's string sort. The results are §2.
4. **Build.** The final stylesheet was built through `@tailwindcss/postcss`
   with 0 warnings. The legacy folder and this document are excluded from
   class detection (`@source not`).
