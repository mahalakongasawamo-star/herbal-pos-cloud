'use client';

// Inline editable table cell used by Product master (retail price, member
// price, reorder level). Ported from legacy-vite-app/src/modules/ProductMaster.jsx's
// NumberCell. Local text buffer until blur/Enter (commit) or Escape (revert).
import { useEffect, useState } from 'react';
import { parseMoney, round2 } from '@/lib/format';
import { cx } from '@/components/ui';

export interface NumberCellProps {
  value: number;
  onCommit: (value: number) => void;
  label: string;
  /** Whole-number mode (reorder level) instead of money (2dp). */
  integer?: boolean;
  /** Placeholder + turmeric warning style shown when the value is unset (money cells only). */
  emptyHint?: string;
}

export function NumberCell({ value, onCommit, label, integer, emptyHint }: NumberCellProps) {
  const show = (v: number | undefined) => (integer ? String(v ?? 0) : Number(v) > 0 ? round2(Number(v)).toFixed(2) : '');
  const [text, setText] = useState(show(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // Syncs the text buffer to an external value (the product's saved
    // price/level) whenever it changes and we're not mid-edit — not a
    // render-loop the set-state-in-effect rule is meant to catch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editing) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const n = integer ? (text === '' ? 0 : Number(text)) : text === '' ? 0 : parseMoney(text);
    if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) {
      setText(show(value));
      return;
    }
    if (n !== Number(value || 0)) onCommit(integer ? n : round2(n));
    setText(show(n));
  };

  const unset = !integer && !(Number(value) > 0);

  return (
    <input
      aria-label={label}
      inputMode={integer ? 'numeric' : 'decimal'}
      className={cx(
        'num h-9 w-full min-w-[84px] rounded-lg border px-2 text-right font-semibold text-ink placeholder:font-normal focus:border-leaf focus:outline-hidden focus:ring-2 focus:ring-leaf/30',
        unset && emptyHint ? 'border-turmeric/60 bg-turmeric-soft placeholder:text-turmeric-ink/70' : 'border-line-strong bg-surface placeholder:text-muted',
      )}
      value={text}
      placeholder={emptyHint || (integer ? '0' : '—')}
      onFocus={(e) => {
        setEditing(true);
        e.target.select();
      }}
      onChange={(e) => setText(integer ? e.target.value.replace(/\D/g, '') : e.target.value.replace(/[^\d.,]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(show(value));
          setEditing(false);
          setTimeout(() => e.currentTarget.blur(), 0);
        }
      }}
    />
  );
}
