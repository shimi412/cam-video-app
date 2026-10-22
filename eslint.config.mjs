import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-*/**",
    ".secrets/**",
    "out/**",
    "build/**",
    "storage/**",
    "motion/template/assets/gsap.min.js",
    "comics/template/assets/gsap.min.js",
    ".pg-data/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
