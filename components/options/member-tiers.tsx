'use client';

// Ported from legacy-vite-app/src/modules/Options.jsx's MemberTiers /
// PctInput, with the reducer dispatch replaced by the real addMemberTier /
// removeMemberTier / setMemberTierDiscount / swapMemberTierOrder writes
// (lib/data/options.ts). List order is sort_order from the server, lowest
// rank first, same as legacy.
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Input, Panel, useConfirm, useToast } from '@/components/ui';
import { useCatalog } from '@/components/providers/catalog-provider';
import { createClient } from '@/lib/supabase/client';
import { addMemberTier, removeMemberTier, setMemberTierDiscount, swapMemberTierOrder } from '@/lib/data/options';
import { norm } from '@/lib/format';
import type { MemberTier } from '@/lib/types';

function PctInput({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value ?? 0));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    // Syncs the text buffer to the server value whenever it changes and
    // we're not mid-edit — see NumberCell (Product master) for the same
    // pattern; not a render-loop the set-state-in-effect rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editing) setText(String(value ?? 0));
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const n = text === '' ? 0 : Number(text);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setText(String(value ?? 0));
      return;
    }
    if (n !== Number(value)) onCommit(Math.round(n * 10) / 10);
  };
  return (
    <div className="relative w-28">
      <input
        aria-label={label}
        inputMode="decimal"
        className="num h-10 w-full rounded-lg border border-line-strong bg-surface pl-3 pr-8 text-right font-bold text-ink focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/30"
        value={text}
        onFocus={(e) => {
          setEditing(true);
          e.target.select();
        }}
        onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-semibold text-muted">%</span>
    </div>
  );
}

export function MemberTiers({ className }: { className?: string }) {
  const { memberTiers, refetch } = useCatalog();
  const confirm = useConfirm();
  const toast = useToast();
  const [name, setName] = useState('');

  const clean = norm(name);
  const dup = !!clean && memberTiers.some((t) => t.name.toLowerCase() === clean.toLowerCase());
  const sorted = [...memberTiers].sort((a, b) => a.sortOrder - b.sortOrder);

  const fail = (title: string, err: unknown) => toast({ tone: 'bad', title, message: err instanceof Error ? err.message : 'Something went wrong.' });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clean || dup) return;
    try {
      await addMemberTier(createClient(), clean);
      await refetch();
      setName('');
    } catch (err) {
      fail('Could not add the tier', err);
    }
  };

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[i];
    const b = sorted[j];
    try {
      await swapMemberTierOrder(createClient(), { id: a.id, sortOrder: a.sortOrder }, { id: b.id, sortOrder: b.sortOrder });
      await refetch();
    } catch (err) {
      fail('Could not reorder', err);
    }
  };

  const setDiscount = async (id: string, pct: number) => {
    try {
      await setMemberTierDiscount(createClient(), id, pct);
      await refetch();
    } catch (err) {
      fail('Could not update the discount', err);
    }
  };

  const remove = async (t: MemberTier) => {
    const ok = await confirm({
      title: `Remove the ${t.name} tier?`,
      message: 'Past sales keep this tier name. Tier prices set for it on products stop being used.',
      confirmLabel: 'Remove tier',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await removeMemberTier(createClient(), t.id);
      await refetch();
    } catch (err) {
      fail('Could not remove the tier', err);
    }
  };

  return (
    <Panel
      as="section"
      className={className}
      title="Member tiers and discounts"
      description="Lowest rank first. The discount % applies to products that have no member or tier price."
    >
      <ul className="divide-y divide-line rounded-xl border border-line">
        {sorted.map((t, i) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="flex w-5 flex-col items-center" aria-hidden="true">
              <span className="num text-xs font-bold text-muted">{i + 1}</span>
            </span>
            <span className="min-w-[120px] flex-1 font-semibold text-ink">{t.name}</span>
            <span className="flex items-center gap-2 text-sm text-ink-2">
              Discount
              <PctInput label={`${t.name} discount percent`} value={t.discountPct} onCommit={(v) => void setDiscount(t.id, v)} />
            </span>
            <span className="flex items-center">
              <Button size="sm" variant="ghost" onClick={() => void move(i, -1)} disabled={i === 0} aria-label={`Move ${t.name} up`}>
                Up
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void move(i, 1)} disabled={i === sorted.length - 1} aria-label={`Move ${t.name} down`}>
                Down
              </Button>
              <IconButton icon={Trash2} label={`Remove ${t.name}`} tone="danger" disabled={sorted.length <= 1} onClick={() => void remove(t)} />
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input aria-label="New member tier" value={name} onChange={(e) => setName(e.target.value)} placeholder="New tier name" invalid={dup} />
        <Button type="submit" icon={Plus} disabled={!clean || dup}>
          Add tier
        </Button>
      </form>
      {dup && <p className="mt-1 text-sm text-bad">That tier already exists.</p>}
    </Panel>
  );
}
