import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    return process.env.API_PROXY_URL
      ? [{ source: "/api/:path*", destination: `${process.env.API_PROXY_URL}/:path*` }]
      : [];
  },
};
export default config;
