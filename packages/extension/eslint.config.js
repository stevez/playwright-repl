import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**", "src/panel/lib/locator/**", "example/**"],
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts", "e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-empty-pattern": "off",
    },
  },
  {
    files: ["types.d.ts"],
    rules: {
      "no-var": "off",
    },
  },
  {
    files: ["src/content/recorder.ts"],
    rules: {
      "no-var": "off",
    },
  },
  {
    files: ["src/panel/lib/page-scripts.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
);
