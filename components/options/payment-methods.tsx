'use client';

// Ported from legacy-vite-app/src/modules/Options.jsx's PaymentMethods,
// with the reducer dispatch replaced by the real addPaymentMethod /
// removePaymentMethod / setPaymentMethodIsCash writes (lib/data/options.ts).
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Input, Panel, Toggle, useConfirm, useToast } from '@/components/ui';
import { useCatalog } from '@/components/providers/catalog-provider';
import { createClient } from '@/lib/supabase/client';
import { addPaymentMethod, removePaymentMethod, setPaymentMethodIsCash } from '@/lib/data/options';
import { norm } from '@/lib/format';

export function PaymentMethods() {
  const { paymentMethods, refetch } = useCatalog();
  const confirm = useConfirm();
  const toast = useToast();
  const [name, setName] = useState('');
  const [isCash, setIsCash] = useState(false);

  const clean = norm(name);
  const dup = !!clean && paymentMethods.some((m) => m.name.toLowerCase() === clean.toLowerCase());

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clean || dup) return;
    try {
      await addPaymentMethod(createClient(), clean, isCash);
      await refetch();
      setName('');
      setIsCash(false);
    } catch (err) {
      toast({ tone: 'bad', title: 'Could not add the method', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  };

  const toggleCash = async (id: string, v: boolean) => {
    try {
      await setPaymentMethodIsCash(createClient(), id, v);
      await refetch();
    } catch (err) {
      toast({ tone: 'bad', title: 'Could not update', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  };

  const remove = async (id: string, methodName: string) => {
    const ok = await confirm({
      title: `Remove ${methodName}?`,
      message: 'Past sales keep this method’s name.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await removePaymentMethod(createClient(), id);
      await refetch();
    } catch (err) {
      toast({ tone: 'bad', title: 'Could not remove the method', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  };

  return (
    <Panel title="Payment methods" description="Methods that give change ask for cash tendered; the others ask for a reference number.">
      <ul className="divide-y divide-line rounded-xl border border-line">
        {paymentMethods.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
            <span className="font-semibold text-ink">{m.name}</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-sm text-ink-2">
                <Toggle checked={m.isCash} label={`${m.name} gives change`} onChange={(v) => void toggleCash(m.id, v)} />
                Gives change
              </span>
              <IconButton
                icon={Trash2}
                label={`Remove ${m.name}`}
                tone="danger"
                disabled={paymentMethods.length <= 1}
                onClick={() => void remove(m.id, m.name)}
              />
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          aria-label="New payment method"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Maya"
          className="min-w-[160px] flex-1"
          invalid={dup}
        />
        <span className="flex items-center gap-2 text-sm text-ink-2">
          <Toggle checked={isCash} onChange={setIsCash} label="New method gives change" />
          Gives change
        </span>
        <Button type="submit" icon={Plus} disabled={!clean || dup}>
          Add
        </Button>
      </form>
      {dup && <p className="mt-1 text-sm text-bad">That method already exists.</p>}
    </Panel>
  );
}
