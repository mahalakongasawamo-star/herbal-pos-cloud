// Ported from legacy-vite-app/src/App.jsx BrandMark. Works in Server and
// Client Components. `logo` is the store logo from settings (Phase 1).

import { Leaf } from 'lucide-react';

export function BrandMark({ logo }: { logo?: string | null }) {
  return logo ? (
    <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- the store logo is a data: URL from settings, not an optimisable asset */}
      <img src={logo} alt="" className="h-full w-full object-contain" />
    </span>
  ) : (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-turmeric text-turmeric-ink" aria-hidden="true">
      <Leaf size={22} strokeWidth={2.4} />
    </span>
  );
}
