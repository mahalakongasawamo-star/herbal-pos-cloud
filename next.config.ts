import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server, and its Server Actions (the login form), be reached
  // through a VS Code devtunnel for sharing a local run with someone else.
  // Same-origin (localhost) is always allowed regardless; "**.devtunnels.ms"
  // (one-or-more label wildcard, for <id>-<port>.<region>.devtunnels.ms)
  // covers a transparent tunnel. VS Code's own local port-forwarding agent
  // is NOT transparent, though: it relays public tunnel traffic to
  // localhost:3000 and rewrites the Origin header to match that local
  // target rather than preserving the tunnel hostname the browser actually
  // sent — verified by request, not assumed — so Next's action-origin check
  // (comparing Origin against x-forwarded-host) sees Origin=localhost:3000
  // paired with a tunnel x-forwarded-host and rejects it as a mismatch no
  // devtunnels.ms pattern could ever fix. "localhost:3000" is what actually
  // needs to be on the list. This is a low-risk relaxation, not a real CSRF
  // hole: the only way to reach this port at all is already gated by the
  // tunnel's own (explicitly chosen) Public visibility or direct localhost
  // access — this just lets traffic the tunnel already decided to admit
  // through Next's second, redundant check too.
  // Harmless once nothing is tunneled: an unmatched request is just ignored.
  allowedDevOrigins: ["**.devtunnels.ms"],
  experimental: {
    serverActions: {
      allowedOrigins: ["**.devtunnels.ms", "localhost:3000"],
    },
  },
};

export default nextConfig;
