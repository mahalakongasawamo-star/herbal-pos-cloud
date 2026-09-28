'use client';

// Ported from legacy-vite-app/src/modules/Options.jsx's StoreSettings, with
// legacy's dispatch({type:'SET_SETTINGS', patch}) (an in-memory reducer)
// replaced by updateSettings() — a real owner-only, RLS-checked write that
// every field commits on blur/change, matching the "no separate save
// button" behaviour the legacy module had.
import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button, Field, Input, Panel, Segmented, useToast } from '@/components/ui';
import { LAYOUT_OPTIONS } from '@/components/receipt/receipt-modal';
import { useCatalog } from '@/components/providers/catalog-provider';
import { createClient } from '@/lib/supabase/client';
import { updateSettings } from '@/lib/data/settings';
import { imageToDataUrl } from '@/lib/platform';
import type { PrintLayout } from '@/components/receipt/receipt';

/** Local draft for a text field that commits on blur, but still picks up
 * server/realtime updates while the field isn't focused. */
function useDraft(value: string) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return {
    draft,
    setDraft,
    onFocus: () => {
      focused.current = true;
    },
    onBlurred: () => {
      focused.current = false;
    },
  };
}

export function StoreSettings() {
  const { settings, refetch } = useCatalog();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const reviewedRef = useRef(false);

  const name = useDraft(settings.companyName);
  const details = useDraft(settings.companyDetails);
  const title = useDraft(settings.receiptTitle);
  const footer = useDraft(settings.receiptFooter);

  // The 4th Setup-guide checklist item depends on this having run once.
  useEffect(() => {
    if (settings.optionsReviewed || reviewedRef.current) return;
    reviewedRef.current = true;
    void updateSettings(createClient(), { optionsReviewed: true }).then(() => refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.optionsReviewed]);

  const commit = async (patch: Parameters<typeof updateSettings>[1]) => {
    try {
      await updateSettings(createClient(), patch);
      await refetch();
    } catch (err) {
      toast({ tone: 'bad', title: 'Could not save', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  };

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const dataUrl = await imageToDataUrl(f);
      await commit({ logo: dataUrl });
      toast({ title: 'Logo updated', message: 'It appears on every printed receipt.' });
    } catch (err) {
      toast({ tone: 'bad', title: 'Logo not added', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  };

  return (
    <Panel title="Store and receipt" description="Shown at the top of every receipt.">
      <div className="space-y-4">
        <Field label="Company name" htmlFor="op-co">
          <Input
            id="op-co"
            value={name.draft}
            onFocus={name.onFocus}
            onChange={(e) => name.setDraft(e.target.value)}
            onBlur={() => {
              name.onBlurred();
              if (name.draft !== settings.companyName) void commit({ companyName: name.draft });
            }}
          />
        </Field>
        <Field label="Address and contact details" htmlFor="op-det" hint="One line, for example the branch address and phone number.">
          <Input
            id="op-det"
            value={details.draft}
            onFocus={details.onFocus}
            onChange={(e) => details.setDraft(e.target.value)}
            onBlur={() => {
              details.onBlurred();
              if (details.draft !== settings.companyDetails) void commit({ companyDetails: details.draft });
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Receipt title" htmlFor="op-title">
            <Input
              id="op-title"
              value={title.draft}
              onFocus={title.onFocus}
              onChange={(e) => title.setDraft(e.target.value)}
              onBlur={() => {
                title.onBlurred();
                if (title.draft !== settings.receiptTitle) void commit({ receiptTitle: title.draft });
              }}
            />
          </Field>
          <Field label="Footer message" htmlFor="op-foot">
            <Input
              id="op-foot"
              value={footer.draft}
              onFocus={footer.onFocus}
              onChange={(e) => footer.setDraft(e.target.value)}
              onBlur={() => {
                footer.onBlurred();
                if (footer.draft !== settings.receiptFooter) void commit({ receiptFooter: footer.draft });
              }}
            />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink-2">Logo</p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-white">
              {settings.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logo} alt="Store logo" className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs text-muted">None</span>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogo} />
            <Button icon={ImagePlus} onClick={() => fileRef.current?.click()}>
              {settings.logo ? 'Replace logo' : 'Upload logo'}
            </Button>
            {settings.logo && (
              <Button variant="dangerGhost" onClick={() => void commit({ logo: '' })}>
                Remove
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted">PNG or JPG. It&rsquo;s resized automatically to keep it small.</p>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink-2">Print layout (A4 portrait, two copies)</p>
          <Segmented
            ariaLabel="Print layout"
            size="sm"
            value={settings.printLayout}
            onChange={(v: PrintLayout) => void commit({ printLayout: v })}
            options={LAYOUT_OPTIONS}
          />
          <p className="mt-1.5 text-xs text-muted">Top and bottom gives each copy a half page; side by side fits long orders on one sheet.</p>
        </div>
      </div>
    </Panel>
  );
}
