// A next/link that looks exactly like <Button variant="leaf"> (md) from
// components/ui. The legacy kit has no link-button, and ui.tsx doesn't export
// its class constants, so the classes are mirrored here (already Tailwind v4:
// outline-hidden instead of v3 outline-none).

import Link from 'next/link';
import type { ComponentProps } from 'react';

const LINK_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold whitespace-nowrap select-none transition-colors ' +
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
  'h-11 px-4 text-[15px] bg-leaf text-leaf-ink hover:bg-leaf-2';

export function ButtonLink({ className, ...rest }: ComponentProps<typeof Link>) {
  return <Link className={className ? `${LINK_BUTTON} ${className}` : LINK_BUTTON} {...rest} />;
}
