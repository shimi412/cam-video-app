import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runtime media and the embedded development database are persistent data,
  // never deployment bundle inputs.
  outputFileTracingExcludes: { "/*": ["./storage/**/*", "./.pg-data/**/*"] },
};

export default nextConfig;
