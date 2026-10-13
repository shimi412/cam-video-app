import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.CAM_NEXT_DIR ?? ".next",
  typescript: { tsconfigPath: process.env.CAM_TS_CONFIG ?? "tsconfig.json" },
  // Runtime media and the embedded development database are persistent data,
  // never deployment bundle inputs.
  outputFileTracingExcludes: { "/*": ["./storage/**/*", "./.pg-data/**/*"] },
};

export default nextConfig;
