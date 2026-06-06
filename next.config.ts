import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// Local dev only: proxy /api/* to the backend running on localhost (or a
// custom target set via API_PROXY_TARGET). In production this is handled by
// the netlify.toml [[redirects]] rule, which takes effect before Next.js and
// doesn't depend on build-time environment variables.
const apiOrigin = process.env.API_PROXY_TARGET ?? "http://localhost:4000";
const isNetlify = Boolean(process.env.NETLIFY);

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  async rewrites() {
    // Skip the rewrite on Netlify — the netlify.toml redirect handles it.
    if (isNetlify) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
