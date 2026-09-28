'use client';

// Ported from legacy-vite-app/src/components/LiveClock.jsx.

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

// The server can't know the browser's clock or time zone, so the clock renders
// nothing on the server and during hydration, then shows the time on the next
// render. When it mounts after hydration (client-side navigation) it renders
// the time straight away, like the Vite app.
const subscribeNoop = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export interface LiveClockProps {
  render: (now: Date) => ReactNode;
}

/** Ticks once a second without re-rendering anything else. */
export function LiveClock({ render }: LiveClockProps) {
  const isClient = useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return isClient ? render(now) : null;
}
