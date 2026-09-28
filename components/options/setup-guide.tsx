'use client';

// Rewritten from legacy-vite-app/src/modules/SetupGuide.jsx (SPEC §10 —
// port the shape, not verbatim: this app has no localStorage, no cashier
// stations, and a real server-issued receipt number). Rendered inside the
// Setup guide Drawer in components/shell/AppShell.tsx.
//
// Dropped entirely: legacy's "Keeping records safe" section (single-tab
// lock, per-device storage, manual JSON export reminders) — all obsolete
// once the database is a shared Supabase Cloud instance rather than one
// browser's IndexedDB. Replaced with one short, honest line about backups.
import { Circle, CircleCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/components/ui';
import { useCatalog } from '@/components/providers/catalog-provider';
import { useLiveStock } from '@/lib/hooks/use-live-stock';
import { int } from '@/lib/format';
import { navItem, type RouteId } from '@/lib/nav';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-5">
      <h3 className="mb-2 text-base font-bold text-ink">{title}</h3>
      <div className="space-y-2 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3">
          <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-xs font-bold text-leaf">{i + 1}</span>
          <span className="min-w-0">{t}</span>
        </li>
      ))}
    </ol>
  );
}

const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>;

export function SetupGuide() {
  const { products, memberTiers, paymentMethods, branches, settings } = useCatalog();
  const liveStock = useLiveStock();

  const active = products.filter((p) => p.active);
  const stockable = active.filter((p) => !p.isPackage);
  const pricedActive = active.filter((p) => p.price > 0).length;
  const stocked = stockable.filter((p) => branches.some((b) => liveStock.onHand(b.id, p.id) > 0)).length;

  const checklist: { id: RouteId; title: string; detail: string; done: boolean }[] = [
    {
      id: 'options',
      title: 'Add your store details',
      detail: 'Company name, address and logo for the receipt header.',
      done: settings.companyName.trim().length > 0,
    },
    {
      id: 'products',
      title: 'Set product prices',
      detail: `${int(pricedActive)} of ${int(active.length)} products have a retail price.`,
      done: active.length > 0 && pricedActive === active.length,
    },
    {
      id: 'stock',
      title: 'Record opening stock',
      detail: `${int(stocked)} of ${int(stockable.length)} stock items have stock recorded.`,
      done: stockable.length > 0 && stocked === stockable.length,
    },
    {
      id: 'options',
      title: 'Check payments and tiers',
      detail: `${int(paymentMethods.length)} payment methods, ${int(memberTiers.length)} member tiers.`,
      done: settings.optionsReviewed,
    },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div>
      <p className="text-[15px] text-ink-2">
        Four things to do before the first sale. This list updates as you go; <B>{int(doneCount)} of 4</B> are done.
      </p>
      <ul className="mt-4 space-y-2 pb-5">
        {checklist.map((c, i) => (
          <li key={i} className={cx('flex items-start gap-3 rounded-xl border p-3', c.done ? 'border-ok/30 bg-ok-soft' : 'border-line bg-surface')}>
            {c.done ? (
              <CircleCheck size={22} className="mt-0.5 shrink-0 text-ok" aria-label="Done" />
            ) : (
              <Circle size={22} className="mt-0.5 shrink-0 text-line-strong" aria-label="To do" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink">{c.title}</p>
              <p className="text-sm text-muted">{c.detail}</p>
            </div>
            <Link
              href={navItem(c.id).href}
              className={cx(
                'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-semibold transition-colors',
                'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                c.done ? 'text-ink-2 hover:bg-sunken hover:text-ink' : 'border border-line-strong bg-surface text-ink hover:bg-sunken',
              )}
            >
              Open {navItem(c.id).label}
            </Link>
          </li>
        ))}
      </ul>

      <Section title="1. Record opening stock">
        <Steps
          items={[
            <>Count what is physically on the shelf at each branch — stock is tracked per branch, not pooled together.</>,
            <>
              Open <B>Add stock</B> and choose <B>Bulk receive</B>. Enter each item&rsquo;s count in <B>Qty in</B>. Leave items you don&rsquo;t carry blank.
            </>,
            <>
              Add a note such as &ldquo;Opening count&rdquo;, then press <B>Receive</B>. Check the totals on the <B>Inventory</B> page.
            </>,
            <>
              For later deliveries use <B>Receive stock</B>: pick the date, the SKU and the quantity.
            </>,
          ]}
        />
        <p className="text-sm text-muted">
          Entry packages aren&rsquo;t stocked directly — selling one deducts its included items, so make sure those items&rsquo; stock
          covers package sales.
        </p>
      </Section>

      <Section title="2. Set prices in Product master">
        <Steps
          items={[
            <>
              Open <B>Product master</B>. Products missing a retail price are flagged there.
            </>,
            <>
              Type the <B>Retail price</B> and press Enter or Tab. It saves immediately.
            </>,
            <>
              Add a <B>Member price</B> where members pay a fixed amount. Use <B>Tier prices</B> when different member tiers pay different amounts.
            </>,
            <>
              Products with no member price can still get a discount: set a percentage per tier in <B>Options</B>.
            </>,
            <>
              Set the <B>Reorder level</B>: the stock count at which an item shows as low.
            </>,
            <>Set prices for entry packages too, and check their contents to confirm what each includes.</>,
          ]}
        />
      </Section>

      <Section title="3. Payment methods and tiers">
        <Steps
          items={[
            <>
              In <B>Options</B>, check the payment methods. Methods that <B>give change</B> ask for cash tendered; the others ask
              for an optional reference number.
            </>,
            <>Review the member tiers and their discount %. Tiers are listed lowest rank first.</>,
            <>Enter your company name and upload a logo. They print on both receipt copies.</>,
          ]}
        />
      </Section>

      <Section title="4. Ringing up a sale">
        <Steps
          items={[
            <>Sign in as the cashier for that counter — there&rsquo;s no separate station picker any more, the signed-in account is the cashier.</>,
            <>
              Enter the <B>Customer name</B>, and the leader and upline if known. For a repeat customer, the POS offers their details
              from the last visit.
            </>,
            <>
              Pick the <B>Customer tier</B>. For members, pick the <B>Member tier</B>; prices update right away.
            </>,
            <>Tap products to add them, or scan or type a SKU and press Enter. Adjust quantities with the − and + buttons.</>,
            <>
              Choose the <B>Payment method</B>. For cash, enter the amount tendered or tap a quick amount; the change shows in the
              total panel.
            </>,
            <>
              Press <B>Save sale</B>. Stock is deducted on the server at that moment, including package contents, and the receipt
              gets its number from the server.
            </>,
            <>
              Press <B>Print</B> for the customer and cashier copies on one A4 sheet, then start a new transaction.
            </>,
          ]}
        />
        <p className="text-sm text-muted">
          Wrong sale? Open it in the <B>Sales log</B> and choose <B>Void sale</B>. The items go back into stock and the sale is
          marked void.
        </p>
      </Section>

      <Section title="Backups">
        <p>Once this app is deployed, Supabase Cloud backs up the database automatically — there&rsquo;s nothing to export by hand.</p>
      </Section>
    </div>
  );
}
