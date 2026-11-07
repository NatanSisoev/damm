import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Anonymity boundary (AGENTS.md): HR code reads aggregates only, through @damm/db/hr.
  {
    files: ["app/hr/**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@damm/db",
              message:
                "Anonymity boundary: HR code must not import the @damm/db root (it exposes getDb and raw tables). Use @damm/db/hr.",
            },
            {
              name: "better-sqlite3",
              message:
                "Anonymity boundary: HR code must not open the database directly. Use @damm/db/hr.",
            },
            {
              name: "node:sqlite",
              message:
                "Anonymity boundary: HR code must not open the database directly. Use @damm/db/hr.",
            },
          ],
          patterns: [
            {
              group: ["@damm/db/*", "!@damm/db/hr"],
              message:
                "Anonymity boundary: HR code may only import @damm/db/hr (aggregates and the analytics view), never the join, account or response repositories.",
            },
            {
              group: ["**/packages/db/**", "**/join-repository*", "**/response-repository*", "**/resposta-repository*", "**/compte-repository*", "**/account-repository*", "**/connection"],
              message:
                "Anonymity boundary: HR code must not reach into packages/db internals or raw response/account repositories. Use @damm/db/hr.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
