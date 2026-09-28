// Next 16 Proxy (formerly middleware.ts). Refreshes the Supabase session on
// every page request and does the optimistic signed-in / signed-out redirects.
// Logic lives in lib/supabase/proxy.ts; the real auth gate is lib/auth.ts.

import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except:
     * - _next/* (static chunks, image optimisation, dev HMR)
     * - favicon.ico and other metadata files
     * - static files by extension (images, fonts, css/js, manifests)
     */
    '/((?!_next/|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|css|js|map|txt|xml|webmanifest)$).*)',
  ],
};
