import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Remotion video workspace: own deps and conventions, not part of the site.
    "video-production/**",
  ]),
  // An undeclared variable is a runtime crash, not a style issue. On
  // 2026-10-13 a search route read a variable declared in a different
  // function; every search threw, the catch-all returned empty "degraded"
  // results, and lint, unit tests and the build all passed. src/ had zero
  // existing violations when this was turned on.
  {
    files: ["src/**/*.{js,jsx,mjs}"],
    rules: { "no-undef": "error" },
  },
]);

export default eslintConfig;
