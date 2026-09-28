import { makeReceiptNo } from './format';

/** A fresh POS transaction. The receipt number is assigned when it opens. */
export function newDraft(seqNext, cashier = '', paymentMethod = 'Cash') {
  return {
    receiptNo: makeReceiptNo(new Date(), seqNext),
    customerName: '',
    leaderName: '',
    uplineName: '',
    customerTier: 'New',
    memberTier: '',
    paymentMethod,
    tendered: '',
    reference: '',
    cashier,
    lines: [],
    savedAt: null,
  };
}

export const isDraft = (d) => !!d && typeof d === 'object' && typeof d.receiptNo === 'string' && Array.isArray(d.lines);

export const draftHasWork = (d) =>
  !d.savedAt && (d.lines.length > 0 || !!d.customerName.trim() || !!d.leaderName.trim() || !!d.uplineName.trim());
