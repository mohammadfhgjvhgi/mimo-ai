import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  // P-hardening: Enable React 19 strict mode (catches unsafe lifecycles, double-render side effects)
  reactStrictMode: true,
  // P-hardening: Don't leak Next.js in X-Powered-By header
  poweredByHeader: false,
};

export default nextConfig;
