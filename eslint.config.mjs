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
    "out/**",
    "build/**",
    "next-env.d.ts",
    "huberick-temp/**",
    "tmp-next-app/**",
    "node_modules/**",
    "js/**",
    "modules/**",
    "scripts/**",
    "central-disparo.html",
    "gen_north_star.py",
  ]),
]);

export default eslintConfig;
