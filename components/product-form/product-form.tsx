'use client';

// Shared create/edit product form. Ported from
// legacy-vite-app/src/components/ProductForm.jsx (SPEC §10 — layout/interaction
// carried over near-verbatim). Used by Product master (components/products/*)
// for both "Add product" and "Edit product".
//
// Deviations from legacy, both required by the multi-branch data model:
//   - Legacy's app was single-branch, so "opening stock" needed no branch
//     picker. Here, when allowOpeningStock is on, a Branch select appears
//     next to it (defaulted to the first branch) so the owner says which
//     branch's stock the opening quantity lands in. Only required once the
//     opening-stock quantity is > 0; entries are only sent by the caller
//     when opening stock > 0 anyway.
//   - Inclusions are still expressed by SKU here (matches legacy's
//     stockable-item picker); the caller (components/products/products-client.tsx)
//     resolves SKU -> productId before calling updateProduct for edits, and
//     passes SKUs straight through to receiveStock for creates (its
//     NewProductInput.inclusions shape is SKU-based already).
import { useMemo, useState, type ComponentProps } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useCatalog } from '@/components/providers/catalog-provider';
import { cleanSku, norm, parseMoney } from '@/lib/format';
import { Button, Field, IconButton, Input, Segmented, Select } from '@/components/ui';
import type { Product } from '@/lib/types';

const NEW_CAT = '__new__';
const moneyText = (v: number | undefined) => (Number(v) > 0 ? String(Number(v)) : '');

export interface ProductDraft {
  sku: string;
  name: string;
  category: string;
  isPackage: boolean;
  price: number;
  memberPrice: number;
  reorderLevel: number;
  /** Packages only; empty otherwise. SKU-based — see file header. */
  inclusions: { sku: string; qty: number }[];
}

export interface ProductFormSubmitOptions {
  /** > 0 only when allowOpeningStock and a non-package quantity was entered. */
  openingStock: number;
  /** The branch opening stock should land in. Only meaningful when openingStock > 0. */
  branchId: string;
}

export interface ProductFormProps {
  mode?: 'create' | 'edit';
  initial?: Product;
  allowOpeningStock?: boolean;
  submitLabel?: string;
  onSubmit: (product: ProductDraft, opts: ProductFormSubmitOptions) => void;
  onCancel?: () => void;
  /** Hides the Stock item / Entry package switch (edit mode always locks it too). */
  lockType?: boolean;
}

export function ProductForm({ mode = 'create', initial, allowOpeningStock = false, submitLabel, onSubmit, onCancel, lockType }: ProductFormProps) {
  const { categories, products, branches } = useCatalog();
  const edit = mode === 'edit';
  const [isPackage, setIsPackage] = useState(!!initial?.isPackage);
  const [sku, setSku] = useState(initial?.sku || '');
  const [name, setName] = useState(initial?.name || '');
  const [category, setCategory] = useState(initial?.category || '');
  const [newCategory, setNewCategory] = useState('');
  const [price, setPrice] = useState(moneyText(initial?.price));
  const [memberPrice, setMemberPrice] = useState(moneyText(initial?.memberPrice));
  const [reorder, setReorder] = useState(String(initial?.reorderLevel ?? 10));
  const [inclusions, setInclusions] = useState<{ sku: string; qty: number | string }[]>(
    initial?.inclusions?.length ? initial.inclusions.map((i) => ({ sku: i.sku, qty: i.qty })) : [{ sku: '', qty: 1 }],
  );
  const [opening, setOpening] = useState('');
  const [branchId, setBranchId] = useState(() => initial?.id ? '' : branches[0]?.id ?? '');
  const [tried, setTried] = useState(false);

  const categoryNames = categories.filter((c) => c.isPackage === isPackage).map((c) => c.name);
  const stockables = useMemo(() => products.filter((p) => !p.isPackage && p.active !== false), [products]);
  const chosenCategory = category === NEW_CAT ? norm(newCategory) : category;
  const code = cleanSku(sku);

  const errors: Record<string, string> = {};
  if (!edit) {
    if (!code) errors.sku = 'Enter a SKU.';
    else if (products.some((p) => p.sku === code)) errors.sku = `SKU ${code} is already used.`;
  }
  if (!norm(name)) errors.name = 'Enter the product name.';
  if (!chosenCategory) errors.category = category === NEW_CAT ? 'Name the new category.' : 'Choose a category.';
  else if (category === NEW_CAT && categories.some((c) => c.name.toLowerCase() === chosenCategory.toLowerCase())) {
    errors.category = 'That category already exists. Pick it from the list.';
  }
  const priceNum = price === '' ? 0 : parseMoney(price);
  const memberNum = memberPrice === '' ? 0 : parseMoney(memberPrice);
  if (!(priceNum >= 0)) errors.price = 'Enter a valid amount.';
  if (!(memberNum >= 0)) errors.memberPrice = 'Enter a valid amount.';
  const reorderNum = reorder === '' ? 0 : Number(reorder);
  if (!isPackage && !(Number.isInteger(reorderNum) && reorderNum >= 0)) errors.reorder = 'Use a whole number, 0 or more.';
  const cleanIncl = inclusions.filter((i) => i.sku);
  if (isPackage) {
    if (!cleanIncl.length) errors.inclusions = 'Add at least one item the package contains.';
    else if (new Set(cleanIncl.map((i) => i.sku)).size !== cleanIncl.length) errors.inclusions = 'Each item should appear once. Raise its quantity instead.';
    else if (cleanIncl.some((i) => !(Number.isInteger(Number(i.qty)) && Number(i.qty) >= 1))) errors.inclusions = 'Quantities must be whole numbers, 1 or more.';
  }
  const openingNum = opening === '' ? 0 : Number(opening);
  const wantsOpening = allowOpeningStock && !isPackage;
  if (wantsOpening && !(Number.isInteger(openingNum) && openingNum >= 0)) errors.opening = 'Use a whole number, 0 or more.';
  if (wantsOpening && openingNum > 0 && !branchId) errors.branch = 'Choose a branch for the opening stock.';
  const show = (k: string) => (tried ? errors[k] : undefined);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) return;
    onSubmit(
      {
        sku: edit ? (initial?.sku ?? code) : code,
        name: norm(name),
        category: chosenCategory,
        isPackage,
        price: priceNum,
        memberPrice: memberNum,
        reorderLevel: isPackage ? 0 : reorderNum,
        inclusions: isPackage ? cleanIncl.map((i) => ({ sku: i.sku, qty: Number(i.qty) })) : [],
      },
      { openingStock: wantsOpening ? openingNum : 0, branchId },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {!edit && !lockType && (
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink-2">Type</p>
          <Segmented
            ariaLabel="Product type"
            value={isPackage ? 'package' : 'product'}
            onChange={(v) => {
              setIsPackage(v === 'package');
              setCategory('');
            }}
            options={[
              { value: 'product', label: 'Stock item' },
              { value: 'package', label: 'Entry package' },
            ]}
          />
          <p className="mt-1.5 text-xs text-muted">
            {isPackage ? 'Packages aren’t stocked. Selling one deducts the items it contains.' : 'Stock items are counted in inventory.'}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Field label="SKU" htmlFor="pf-sku" required={!edit} error={show('sku')} hint={edit ? 'SKUs can’t be changed.' : 'Letters, numbers and dashes.'}>
          <Input
            id="pf-sku"
            value={edit ? (initial?.sku ?? '') : sku}
            readOnly={edit}
            invalid={!!show('sku')}
            className="font-mono uppercase"
            placeholder="OC-NEW"
            onChange={(e) => setSku(e.target.value.toUpperCase())}
            autoComplete="off"
          />
        </Field>
        <Field label="Product name" htmlFor="pf-name" required error={show('name')}>
          <Input id="pf-name" value={name} invalid={!!show('name')} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="pf-cat" required error={show('category')}>
          <Select id="pf-cat" value={category} invalid={!!show('category')} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose a category</option>
            {categoryNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={NEW_CAT}>New category&hellip;</option>
          </Select>
        </Field>
        {category === NEW_CAT && (
          <Field label="New category name" htmlFor="pf-newcat" required>
            <Input id="pf-newcat" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} autoComplete="off" />
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Retail price" htmlFor="pf-price" error={show('price')} hint="What new customers pay.">
          <MoneyInput id="pf-price" value={price} onChange={setPrice} invalid={!!show('price')} />
        </Field>
        <Field label="Member price" htmlFor="pf-member" error={show('memberPrice')} hint="Optional. Leave blank to use the tier discount.">
          <MoneyInput id="pf-member" value={memberPrice} onChange={setMemberPrice} invalid={!!show('memberPrice')} />
        </Field>
        {!isPackage && (
          <Field label="Reorder level" htmlFor="pf-reorder" error={show('reorder')} hint="Low-stock alert at or below this.">
            <Input id="pf-reorder" inputMode="numeric" className="num" value={reorder} onChange={(e) => setReorder(e.target.value.replace(/\D/g, ''))} />
          </Field>
        )}
      </div>

      {isPackage && (
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold text-ink-2">Package contents</legend>
          <div className="space-y-2">
            {inclusions.map((inc, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  aria-label={`Item ${i + 1}`}
                  value={inc.sku}
                  onChange={(e) => setInclusions((xs) => xs.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))}
                  className="min-w-0 flex-1"
                >
                  <option value="">Choose an item</option>
                  {stockables.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label={`Quantity of item ${i + 1}`}
                  inputMode="numeric"
                  className="num w-20 text-center"
                  value={String(inc.qty)}
                  onChange={(e) => setInclusions((xs) => xs.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x)))}
                />
                <IconButton icon={Trash2} label={`Remove item ${i + 1}`} tone="danger" onClick={() => setInclusions((xs) => xs.filter((_, j) => j !== i))} />
              </div>
            ))}
          </div>
          {show('inclusions') && <p className="mt-2 text-sm font-medium text-bad">{show('inclusions')}</p>}
          <Button type="button" size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={() => setInclusions((xs) => [...xs, { sku: '', qty: 1 }])}>
            Add item
          </Button>
        </fieldset>
      )}

      {wantsOpening && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Opening stock" htmlFor="pf-open" error={show('opening')} hint="Optional. Recorded as a stock-in dated today.">
            <Input id="pf-open" inputMode="numeric" className="num" value={opening} onChange={(e) => setOpening(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </Field>
          <Field label="Branch" htmlFor="pf-branch" error={show('branch')} hint="Which branch receives the opening stock.">
            <Select id="pf-branch" value={branchId} invalid={!!show('branch')} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Choose a branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="leaf">
          {submitLabel || (edit ? 'Save changes' : 'Add product')}
        </Button>
      </div>
    </form>
  );
}

export function MoneyInput({ id, value, onChange, invalid, className, ...rest }: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  className?: string;
} & Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'id' | 'className'>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-muted">&#8369;</span>
      <Input
        id={id}
        inputMode="decimal"
        className={`num pl-8 ${className || ''}`}
        value={value}
        invalid={invalid}
        placeholder="0.00"
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        {...rest}
      />
    </div>
  );
}
