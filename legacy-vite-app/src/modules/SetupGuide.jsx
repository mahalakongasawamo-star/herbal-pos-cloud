import React from 'react';
import { Circle, CircleCheck } from 'lucide-react';
import { useApp } from '../lib/context';
import { onHand } from '../lib/pricing';
import { DEFAULT_COMPANY } from '../lib/seed';
import { int } from '../lib/format';
import { Button, cx } from '../components/ui';

function Section({ title, children }) {
  return (
    <section className="border-t border-line py-5">
      <h3 className="mb-2 text-base font-bold text-ink">{title}</h3>
      <div className="space-y-2 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

function Steps({ items }) {
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

const B = ({ children }) => <strong className="font-semibold text-ink">{children}</strong>;

export function SetupGuide({ onClose }) {
  const { data, go } = useApp();
  const open = (tab) => {
    go(tab);
    onClose();
  };
  const active = data.products.filter((p) => p.active !== false);
  const priced = active.filter((p) => p.price > 0).length;
  const stockables = active.filter((p) => !p.isPackage);
  const stocked = stockables.filter((p) => (Number(data.stock[p.sku]?.added) || 0) > 0 || onHand(data.stock[p.sku]) > 0).length;
  const checklist = [
    {
      done: data.settings.companyName.trim() && data.settings.companyName !== DEFAULT_COMPANY,
      title: 'Add your store details',
      detail: 'Company name, address and logo for the receipt header.',
      tab: 'options',
      cta: 'Open Options',
    },
    {
      done: active.length > 0 && priced === active.length,
      title: 'Set product prices',
      detail: `${int(priced)} of ${int(active.length)} products have a retail price.`,
      tab: 'products',
      cta: 'Open Product master',
    },
    {
      done: stockables.length > 0 && stocked === stockables.length,
      title: 'Record opening stock',
      detail: `${int(stocked)} of ${int(stockables.length)} stock items have stock recorded.`,
      tab: 'stock',
      cta: 'Open Add stock',
    },
    {
      done: !!data.settings.optionsReviewed,
      title: 'Check cashiers, payments and tiers',
      detail: `${int(data.options.cashiers.length)} cashier stations, ${int(data.options.paymentMethods.length)} payment methods, ${int(data.options.memberTiers.length)} member tiers.`,
      tab: 'options',
      cta: 'Open Options',
    },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div>
      <p className="text-[15px] text-ink-2">
        Four things to do before the first sale. This list updates as you go; <B>{int(doneCount)} of 4</B> are done.
      </p>
      <ul className="mt-4 space-y-2 pb-5">
        {checklist.map((c) => (
          <li key={c.title} className={cx('flex items-start gap-3 rounded-xl border p-3', c.done ? 'border-ok/30 bg-ok-soft' : 'border-line bg-surface')}>
            {c.done ? <CircleCheck size={22} className="mt-0.5 shrink-0 text-ok" aria-label="Done" /> : <Circle size={22} className="mt-0.5 shrink-0 text-line-strong" aria-label="To do" />}
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink">{c.title}</p>
              <p className="text-sm text-muted">{c.detail}</p>
            </div>
            <Button size="sm" variant={c.done ? 'ghost' : 'secondary'} onClick={() => open(c.tab)}>
              {c.cta}
            </Button>
          </li>
        ))}
      </ul>

      <Section title="1. Record opening stock">
        <Steps
          items={[
            <>
              Count what is physically on the shelf at each branch. Each device keeps its own stock, so count per branch.
            </>,
            <>
              Open <B>Add stock</B> and choose <B>Bulk receive</B>. Enter each item’s count in <B>Qty in</B>. Leave items you don’t carry blank.
            </>,
            <>
              Add a note such as “Opening count”, then press <B>Receive</B>. Check the totals on the <B>Inventory</B> page.
            </>,
            <>
              For later deliveries use <B>Receive stock</B>: pick the date, the SKU and the quantity. Typing a SKU that doesn’t exist registers a new product on the spot.
            </>,
            <>
              Keyed in the wrong number? Use <B>Undo</B> in Recent stock entries, then enter it again.
            </>,
          ]}
        />
        <p className="text-sm text-muted">
          Entry packages aren’t stocked. Selling a Manager Package deducts 14 × Dok Honey’s Tibicos, so make sure Tibicos stock covers package sales.
        </p>
      </Section>

      <Section title="2. Set prices in Product master">
        <Steps
          items={[
            <>
              Open <B>Product master</B>. Cells highlighted in yellow still need a retail price.
            </>,
            <>
              Type the <B>Retail price</B> and press Enter or Tab. It saves immediately. Esc cancels.
            </>,
            <>
              Add a <B>Member price</B> where members pay a fixed amount. Use <B>Tier prices</B> when Affiliates, Supervisors, Managers and Presidentials pay different amounts.
            </>,
            <>
              Products with no member price can still get a discount: set a percentage per tier in <B>Options</B>.
            </>,
            <>
              Set the <B>Reorder level</B>: the stock count at which an item shows as low.
            </>,
            <>
              Set prices for the entry packages too, and open their contents to confirm what each includes.
            </>,
          ]}
        />
      </Section>

      <Section title="3. Cashiers, payment methods and tiers">
        <Steps
          items={[
            <>
              In <B>Options</B>, check the cashier stations (MNLA-Cashier and BAGUIO-Cashier to start). Add one per counter.
            </>,
            <>
              Check the payment methods. Methods that <B>give change</B> ask for cash tendered; the others ask for an optional reference number.
            </>,
            <>
              Review the member tiers and their discount %. Tiers are listed lowest rank first.
            </>,
            <>
              Enter your company name and upload a logo. They print on both receipt copies.
            </>,
          ]}
        />
      </Section>

      <Section title="4. Ringing up a sale">
        <Steps
          items={[
            <>
              Choose the <B>Cashier</B> station at the top. The POS remembers it on this device.
            </>,
            <>
              Enter the <B>Customer name</B>, and the leader and upline if known. For a repeat customer, the POS offers their details from the last visit.
            </>,
            <>
              Pick the <B>Customer tier</B>. For members, pick the <B>Member tier</B>; prices update right away.
            </>,
            <>
              Tap products to add them, or scan or type a SKU and press Enter. Adjust quantities with the − and + buttons.
            </>,
            <>
              Choose the <B>Payment method</B>. For cash, enter the amount tendered or tap a quick amount; the change shows in the total panel.
            </>,
            <>
              Press <B>Save sale</B>. Stock is deducted at that moment, including package contents.
            </>,
            <>
              Press <B>Print</B> for the customer and cashier copies on one A4 sheet, then <B>New transaction</B>.
            </>,
          ]}
        />
        <p className="text-sm text-muted">
          Wrong sale? Open it in the <B>Sales log</B> and choose <B>Void sale</B>. The items go back into stock and the sale leaves the reports.
        </p>
      </Section>

      <Section title="Keeping records safe">
        <p>
          Everything is saved automatically in this browser, on this device. Clearing the browser’s site data erases it, so export a backup at the end of each day
          from <B>Options → Data and backup</B>.
        </p>
        <p>
          Run the POS in one browser tab at a time. If it’s opened in a second tab, the first steps aside so the two can’t overwrite each other.
        </p>
        <p>
          Each branch device keeps its own records. To share one inventory between Manila and Baguio, the app needs a shared online database; the backup files
          already match the structure it would use.
        </p>
      </Section>
    </div>
  );
}
