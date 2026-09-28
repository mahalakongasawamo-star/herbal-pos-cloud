// Ported near-verbatim from legacy-vite-app/src/components/Receipt.jsx
// (SPEC §10 — "unchanged" concern). Same class names, same CSS, same
// markup; only the data shape underneath changed (this app's Sale type —
// receiptNo/ts/cashier/etc — instead of the legacy in-memory sale object).
'use client';

import { forwardRef } from 'react';
import { amount, fmtDateTime, peso } from '@/lib/format';
import type { Sale, Settings } from '@/lib/types';

// Receipt styles are plain CSS (not theme tokens) so the paper is always
// black on white, on screen, on paper, and in the downloadable copy.
export const RECEIPT_CSS = `
.rc-sheet{--rc-ink:#111;--rc-soft:#4a4a4a;--rc-rule:#111;--rc-dot:#b9b9b9;color:var(--rc-ink);background:#fff;font-family:"Atkinson Hyperlegible Next","Atkinson Hyperlegible Next Variable",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums;}
.rc-sheet[data-layout="stacked"]{display:flex;flex-direction:column;}
.rc-sheet[data-layout="side"]{display:grid;grid-template-columns:1fr auto 1fr;}
.rc-copy{position:relative;padding:4mm 2mm;font-size:11.5px;line-height:1.38;break-inside:avoid;page-break-inside:avoid;}
.rc-sheet[data-layout="side"] .rc-copy{font-size:9.6px;padding:2mm 1mm;}
.rc-cut{display:flex;align-items:center;gap:8px;color:#8a8a8a;font-size:9px;}
.rc-cut::before,.rc-cut::after{content:"";flex:1;border-top:1px dashed #9a9a9a;}
.rc-sheet[data-layout="side"] .rc-cut{flex-direction:column;padding:0 3mm;writing-mode:vertical-rl;}
.rc-sheet[data-layout="side"] .rc-cut::before,.rc-sheet[data-layout="side"] .rc-cut::after{border-top:0;border-left:1px dashed #9a9a9a;}
.rc-head{display:flex;gap:10px;align-items:center;padding-bottom:7px;border-bottom:1.6px solid var(--rc-rule);}
.rc-logo{width:52px;height:52px;object-fit:contain;flex:none;}
.rc-logo-ph{width:52px;height:52px;flex:none;border:1.4px dashed #9a9a9a;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#8a8a8a;text-align:center;line-height:1.1;}
.rc-co{flex:1;min-width:0;}
.rc-co-name{font-size:1.32em;font-weight:800;letter-spacing:-.01em;line-height:1.15;}
.rc-co-details{color:var(--rc-soft);font-size:.9em;margin-top:1px;}
.rc-copy-tag{flex:none;border:1.2px solid var(--rc-ink);border-radius:999px;padding:1px 9px;font-size:.84em;font-weight:700;}
.rc-title{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin:7px 0 5px;}
.rc-title strong{font-size:1.16em;font-weight:800;}
.rc-no{font-family:"Atkinson Hyperlegible Mono","Atkinson Hyperlegible Mono Variable",ui-monospace,Menlo,Consolas,monospace;font-weight:600;font-size:.95em;}
.rc-meta{display:grid;grid-template-columns:1fr 1fr;gap:1px 14px;margin:0 0 7px;}
.rc-meta div{display:flex;gap:6px;min-width:0;}
.rc-meta dt{color:var(--rc-soft);flex:none;min-width:6.6em;}
.rc-meta dd{margin:0;font-weight:600;overflow-wrap:anywhere;}
.rc-items{width:100%;border-collapse:collapse;}
.rc-items th{font-size:.86em;font-weight:700;color:var(--rc-soft);text-align:left;padding:3px 4px;border-bottom:1.2px solid var(--rc-rule);border-top:1.2px solid var(--rc-rule);}
.rc-items td{padding:3px 4px;border-bottom:1px dotted var(--rc-dot);vertical-align:top;}
.rc-items .n{text-align:right;white-space:nowrap;}
.rc-inc{display:block;color:var(--rc-soft);font-size:.86em;}
.rc-sum{display:flex;justify-content:space-between;gap:16px;margin-top:6px;}
.rc-note{color:var(--rc-soft);font-size:.9em;max-width:48%;}
.rc-totals{min-width:52%;}
.rc-totals div{display:flex;justify-content:space-between;gap:12px;padding:1px 0;}
.rc-totals .grand{font-size:1.24em;font-weight:800;border-top:1.6px solid var(--rc-rule);margin-top:3px;padding-top:4px;}
.rc-totals .sub{color:var(--rc-soft);}
.rc-sign{display:flex;gap:22px;margin-top:16px;}
.rc-sign span{flex:1;border-top:1px solid var(--rc-ink);padding-top:2px;font-size:.84em;color:var(--rc-soft);text-align:center;}
.rc-void{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;}
.rc-void span{transform:rotate(-18deg);border:3px solid #b3261e;color:#b3261e;font-weight:800;font-size:44px;letter-spacing:.12em;padding:0 16px;border-radius:8px;opacity:.55;}
.rc-void-note{margin-top:6px;color:#b3261e;font-weight:700;font-size:.9em;}
`;

// Page setup for printing: only the print root shows, on A4 portrait.
export const PRINT_PAGE_CSS = `
@page{size:A4 portrait;margin:10mm;}
@media print{
  html,body{height:auto!important;background:#fff!important;}
  :root{padding:0!important;}
  body>*:not(#print-root){display:none!important;}
  #print-root{display:block!important;}
  .rc-sheet{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .rc-sheet[data-layout="stacked"] .rc-copy{min-height:132mm;}
}
`;

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === '') return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function Receipt({ sale, settings, copyLabel }: { sale: Sale; settings: Settings; copyLabel?: string }) {
  const nonCash = !sale.isCash;
  const items = sale.items ?? [];
  return (
    <article className="rc-copy" aria-label={copyLabel}>
      <header className="rc-head">
        {settings.logo ? (
          // Legacy behaviour: a data: URL only, resized client-side — never a
          // remote URL, so next/image's optimizer would add nothing here.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="rc-logo" src={settings.logo} alt="" />
        ) : (
          <div className="rc-logo-ph" aria-hidden="true">
            Logo
          </div>
        )}
        <div className="rc-co">
          <div className="rc-co-name">{settings.companyName}</div>
          {settings.companyDetails && <div className="rc-co-details">{settings.companyDetails}</div>}
        </div>
        {copyLabel && <span className="rc-copy-tag">{copyLabel}</span>}
      </header>

      <div className="rc-title">
        <strong>{settings.receiptTitle || 'Sales receipt'}</strong>
        <span>
          No. <span className="rc-no">{sale.receiptNo}</span>
        </span>
      </div>

      <dl className="rc-meta">
        <Meta label="Date & time">{fmtDateTime(sale.createdAt)}</Meta>
        <Meta label="Cashier">{sale.cashierName}</Meta>
        <Meta label="Customer">{sale.customerName}</Meta>
        <Meta label="Payment">
          {sale.paymentMethodName}
          {sale.reference ? ` (ref. ${sale.reference})` : ''}
        </Meta>
        <Meta label="Customer tier">{sale.customerTier}</Meta>
        <Meta label="Member tier">{sale.customerTier === 'Member' ? sale.memberTier : ''}</Meta>
        <Meta label="Leader">{sale.leaderName || '—'}</Meta>
        <Meta label="Upline">{sale.uplineName || '—'}</Meta>
      </dl>

      <table className="rc-items">
        <thead>
          <tr>
            <th>Product</th>
            <th className="n">Qty</th>
            <th className="n">Unit price</th>
            <th className="n">Subtotal</th>
            <th className="n">Discount</th>
            <th className="n">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>
                {it.name}
                {it.isPackage && it.inclusions && it.inclusions.length > 0 && (
                  <span className="rc-inc">Includes {it.inclusions.map((x) => `${x.qty * it.qty} × ${x.name}`).join(', ')}</span>
                )}
              </td>
              <td className="n">{it.qty}</td>
              <td className="n">{amount(it.unitPrice)}</td>
              <td className="n">{amount(it.gross)}</td>
              <td className="n">{it.discount > 0 ? `−${amount(it.discount)}` : '—'}</td>
              <td className="n">{amount(it.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rc-sum">
        <div className="rc-note">
          {items.reduce((a, it) => a + it.qty, 0)} item(s)
          {settings.receiptFooter ? <div style={{ marginTop: 4 }}>{settings.receiptFooter}</div> : null}
          {sale.status === 'void' && (
            <div className="rc-void-note">
              Voided {sale.voidedAt ? fmtDateTime(sale.voidedAt) : ''}
              {sale.voidReason ? ` — ${sale.voidReason}` : ''}
            </div>
          )}
        </div>
        <div className="rc-totals">
          <div className="sub">
            <span>Gross total</span>
            <span>{peso(sale.grossTotal)}</span>
          </div>
          <div className="sub">
            <span>Member discount</span>
            <span>{sale.discountTotal > 0 ? `−${peso(sale.discountTotal)}` : peso(0)}</span>
          </div>
          <div className="grand">
            <span>Total due</span>
            <span>{peso(sale.totalDue)}</span>
          </div>
          <div>
            <span>{nonCash ? `Paid via ${sale.paymentMethodName}` : 'Cash tendered'}</span>
            <span>{peso(sale.tendered)}</span>
          </div>
          <div>
            <span>Change due</span>
            <span>{peso(sale.change)}</span>
          </div>
        </div>
      </div>

      <div className="rc-sign">
        <span>Received by (customer)</span>
        <span>Cashier signature</span>
      </div>

      {sale.status === 'void' && (
        <div className="rc-void" aria-hidden="true">
          <span>VOID</span>
        </div>
      )}
    </article>
  );
}

export type PrintLayout = 'stacked' | 'side';

/** Two copies of the receipt on one A4 sheet. */
export const ReceiptSheet = forwardRef<HTMLDivElement, { sale: Sale; settings: Settings; layout?: PrintLayout }>(
  function ReceiptSheet({ sale, settings, layout = 'stacked' }, ref) {
    return (
      <div ref={ref} className="rc-sheet" data-layout={layout === 'side' ? 'side' : 'stacked'}>
        <Receipt sale={sale} settings={settings} copyLabel="Customer copy" />
        <div className="rc-cut">Cut here</div>
        <Receipt sale={sale} settings={settings} copyLabel="Cashier copy" />
      </div>
    );
  },
);

/** Standalone HTML file for a receipt (prints itself when opened). */
export function receiptDocument(sheetEl: HTMLElement | null, title: string): string {
  const html = sheetEl ? sheetEl.outerHTML : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{margin:0;padding:10mm;background:#fff}${RECEIPT_CSS}${PRINT_PAGE_CSS}@media print{body{padding:0}}</style></head><body><div id="print-root">${html}</div><script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script></body></html>`;
}
