import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.CAM_NEXT_DIR ?? ".next",
  devIndicators: process.env.CAM_LOCAL_DEMO === "1" ? false : undefined,
  typescript: { tsconfigPath: process.env.CAM_TS_CONFIG ?? "tsconfig.json" },
  // Runtime media and the embedded development database are persistent data,
  // never deployment bundle inputs.
  outputFileTracingExcludes: { "/*": ["./storage/**/*", "./.pg-data/**/*"] },
};

export default nextConfig;
