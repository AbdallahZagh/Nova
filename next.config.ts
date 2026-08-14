import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const backend = (
  process.env.API_PROXY_TARGET ?? "https://nova-l5df.onrender.com"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  async rewrites() {
    return {
      // Turbopack's dev manifest can drop app/api/[...path] after a production
      // build, which makes every /api call a Next 404. Proxy first so the
      // backend is always reached.
      beforeFiles: [
        {
          source: "/api/search",
          destination: `${backend}/search`,
        },
        {
          source: "/api/:path*",
          destination: `${backend}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
