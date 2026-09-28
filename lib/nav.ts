// Navigation, route ids and the role -> route access matrix (SPEC §2, §13).
// NAV mirrors the Vite app's App.jsx NAV list: same ids, labels, titles and icons.
//
// Isomorphic on purpose: the client shell imports NAV for the rail, and the
// server (lib/auth.ts) imports ROUTE_ACCESS / canAccess to gate every page.
// The server check is the one that counts; hiding nav items is only UX.

import {
  Boxes,
  ChartColumn,
  PackagePlus,
  ScrollText,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
  type LucideIcon,
} from 'lucide-react';

export const ROLES = ['owner', 'manager', 'cashier'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export const ROUTE_IDS = ['pos', 'sales', 'inventory', 'stock', 'reports', 'products', 'options'] as const;
export type RouteId = (typeof ROUTE_IDS)[number];

export interface NavItem {
  id: RouteId;
  href: `/${RouteId}`;
  /** Short label for the rail and the mobile pill nav. */
  label: string;
  /** Screen title, shown under the company name in the header. */
  title: string;
  icon: LucideIcon;
}

export const NAV: readonly NavItem[] = [
  { id: 'pos', href: '/pos', label: 'POS', title: 'Point of sale', icon: ShoppingCart },
  { id: 'sales', href: '/sales', label: 'Sales log', title: 'Sales log', icon: ScrollText },
  { id: 'inventory', href: '/inventory', label: 'Inventory', title: 'Inventory', icon: Boxes },
  { id: 'stock', href: '/stock', label: 'Add stock', title: 'Add stock', icon: PackagePlus },
  { id: 'reports', href: '/reports', label: 'Reports', title: 'Reports', icon: ChartColumn },
  { id: 'products', href: '/products', label: 'Product master', title: 'Product master', icon: Tags },
  { id: 'options', href: '/options', label: 'Options', title: 'Options', icon: SlidersHorizontal },
];

/**
 * Which screens each role may open (SPEC §2). Enforced server-side by
 * requireRoute() in every page; navFor() uses the same table to hide the rest.
 * Cashiers get Inventory as a read-only view in Phase 1.
 */
export const ROUTE_ACCESS: Record<Role, readonly RouteId[]> = {
  owner: ['pos', 'sales', 'inventory', 'stock', 'reports', 'products', 'options'],
  manager: ['pos', 'sales', 'inventory', 'stock', 'reports'],
  cashier: ['pos', 'sales', 'inventory', 'stock'],
};

export function canAccess(role: Role | null | undefined, id: RouteId): boolean {
  return !!role && ROUTE_ACCESS[role].includes(id);
}

/** The nav items a role may see, in NAV order. */
export function navFor(role: Role | null | undefined): NavItem[] {
  return NAV.filter((n) => canAccess(role, n.id));
}

export function navItem(id: RouteId): NavItem {
  return NAV.find((n) => n.id === id) ?? NAV[0];
}

/** The nav item whose route contains `pathname` (e.g. /sales or /sales/123), if any. */
export function navForPath(pathname: string | null | undefined): NavItem | undefined {
  if (!pathname) return undefined;
  return NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
}

// ---------------------------------------------------------------- Paths and titles

export const APP_NAME = 'Herbal POS';
export const LOGIN_PATH = '/login';
export const HOME_PATH = '/pos';

/** Browser-tab title, matching the Vite app's default document.title. */
export function pageTitle(title: string): string {
  return `${title} · POS and inventory`;
}

/**
 * Validates a post-login `?next=` target. Only same-origin relative paths are
 * allowed: must start with a single '/', never '//' or '/\' (both are
 * protocol-relative to browsers), no backslashes or control characters
 * anywhere, and never the login page itself. Anything else falls back.
 */
export function safeNextPath(raw: unknown, fallback: string = HOME_PATH): string {
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  // Backslashes and control characters anywhere (browsers read '\' as '/' and drop tabs/newlines).
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  const base = 'http://pos.invalid';
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  // Dot segments can normalise into a protocol-relative path: '/..//evil.com' -> '//evil.com'.
  if (url.pathname.startsWith('//')) return fallback;
  if (url.pathname === LOGIN_PATH || url.pathname.startsWith(`${LOGIN_PATH}/`)) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
