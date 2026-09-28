'use client';

// The app frame, ported from legacy-vite-app/src/App.jsx: desktop Rail, header,
// mobile pill nav, <main>, and the Setup guide drawer. Markup and classes match
// the Vite app (Tailwind 3 -> 4: outline-none became outline-hidden).
//
// Differences from the Vite app, on purpose:
// - Tabs are real routes: nav items are next/link, the active one comes from
//   the URL (usePathname) instead of local state.
// - The header's SaveIndicator is gone (nothing saves locally any more). In its
//   place: the branch-scope pill, who is signed in, and Sign out.
// - Nav items are filtered by role. The server enforces the same matrix in
//   every page (lib/auth.ts requireRoute), so this is presentation only.
// - No single-tab lock (SPEC §9).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { Button, Drawer, Pill, cx } from '@/components/ui';
import { APP_NAME, NAV, ROLE_LABEL, navFor, navForPath, type NavItem, type Role } from '@/lib/nav';
import { BrandMark } from './BrandMark';
import { SignOutButton } from './SignOutButton';

export interface AppShellProps {
  role: Role;
  fullName: string;
  /** "MNLA" / "BAGUIO" / "All branches". */
  scopeLabel: string;
  /** True for owners and all-branch managers (profiles.branch_id is null). */
  allBranches: boolean;
  /**
   * Phase 1: number of low or out-of-stock products at the viewer's branch.
   * Drives the badge on the Inventory nav item; hidden while undefined or 0.
   */
  lowStockCount?: number;
  /** Store logo from settings (Phase 1). Falls back to the leaf mark. */
  logo?: string | null;
  children: ReactNode;
}

export function AppShell({ role, fullName, scopeLabel, allBranches, lowStockCount = 0, logo = null, children }: AppShellProps) {
  const pathname = usePathname();
  const [guideOpen, setGuideOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const items = navFor(role);
  const current = navForPath(pathname) ?? NAV[0];
  const isOn = (n: NavItem) => n.id === current.id;
  const openGuide = () => setGuideOpen(true);

  // Like the Vite app's tab switch: every screen starts at the top.
  useEffect(() => {
    mainRef.current?.scrollTo?.(0, 0);
  }, [pathname]);

  return (
    <>
      <div className="flex h-full">
        <Rail items={items} isOn={isOn} lowCount={lowStockCount} onGuide={openGuide} logo={logo} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
            <div className="md:hidden">
              <BrandMark logo={logo} />
            </div>
            <div className="min-w-0 flex-1">
              {/* The store name moves to the settings table in Phase 1. */}
              <p className="truncate text-[15px] font-extrabold leading-tight text-ink">{APP_NAME}</p>
              <p className="truncate text-xs text-muted">{current.title}</p>
            </div>
            <Pill tone={allBranches ? 'leaf' : 'turmeric'} className="shrink-0">
              <span className="sr-only">Branch: </span>
              {scopeLabel}
            </Pill>
            <div className="hidden min-w-0 max-w-[14rem] text-right sm:block">
              <p className="truncate text-sm font-bold leading-tight text-ink">{fullName}</p>
              <p className="truncate text-xs text-muted">{ROLE_LABEL[role]}</p>
            </div>
            <SignOutButton compact className="shrink-0" />
            <Button size="sm" variant="ghost" icon={BookOpen} className="md:hidden" onClick={openGuide} aria-label="Setup guide">
              Guide
            </Button>
          </header>
          <nav aria-label="Main" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-2 md:hidden">
            {items.map((n) => {
              const on = isOn(n);
              return (
                <Link
                  key={n.id}
                  href={n.href}
                  aria-current={on ? 'page' : undefined}
                  className={cx(
                    'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-leaf',
                    on ? 'bg-leaf text-leaf-ink' : 'text-ink-2 hover:bg-sunken',
                  )}
                >
                  <n.icon size={16} aria-hidden="true" />
                  {n.label}
                  {n.id === 'inventory' && lowStockCount > 0 && <span className="num rounded-full bg-warn px-1.5 text-[11px] font-bold text-surface">{lowStockCount}</span>}
                </Link>
              );
            })}
          </nav>
          <main ref={mainRef} id="main" className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
      <Drawer open={guideOpen} onClose={() => setGuideOpen(false)} title="Setup guide">
        <p className="text-[15px] leading-relaxed text-ink-2">The setup guide is ported in Phase 1.</p>
      </Drawer>
    </>
  );
}

interface RailProps {
  items: NavItem[];
  isOn: (n: NavItem) => boolean;
  lowCount: number;
  onGuide: () => void;
  logo: string | null;
}

function Rail({ items, isOn, lowCount, onGuide, logo }: RailProps) {
  return (
    <nav aria-label="Main" className="hidden w-[92px] shrink-0 flex-col bg-rail text-rail-ink md:flex">
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-white/10">
        <BrandMark logo={logo} />
      </div>
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
        {items.map((n) => {
          const on = isOn(n);
          return (
            <li key={n.id}>
              <Link
                href={n.href}
                aria-current={on ? 'page' : undefined}
                className={cx(
                  'relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11.5px] font-semibold leading-tight transition-colors',
                  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-turmeric',
                  on ? 'bg-turmeric text-turmeric-ink' : 'text-rail-ink hover:bg-white/10',
                )}
              >
                <n.icon size={21} aria-hidden="true" strokeWidth={on ? 2.4 : 2} />
                <span className="text-center">{n.label}</span>
                {n.id === 'inventory' && lowCount > 0 && (
                  <span className="num absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-warn px-1 text-center text-[10.5px] font-bold leading-[18px] text-white" aria-label={`${lowCount} low or out of stock`}>
                    {lowCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="shrink-0 border-t border-white/10 p-2">
        <button
          type="button"
          onClick={onGuide}
          className="flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11.5px] font-semibold leading-tight text-rail-muted hover:bg-white/10 hover:text-rail-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-turmeric"
        >
          <BookOpen size={20} aria-hidden="true" />
          Setup guide
        </button>
      </div>
    </nav>
  );
}
