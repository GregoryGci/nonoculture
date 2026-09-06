import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.wrangler/**", "**/node_modules/**", "**/coverage/**"],
  },

  // --- Everything TypeScript -----------------------------------------------------------
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The project bans `any` outright; make that a lint error, not just a tsc setting.
      "@typescript-eslint/no-explicit-any": "error",
      // Unused code is the class of bug lint is actually good at catching here. Leading
      // underscore stays allowed for the deliberate destructuring-to-omit idiom.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // A dropped promise in the Durable Object means a lost storage write or broadcast.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },

  // --- Web client ----------------------------------------------------------------------
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    // `configs.flat` is the flat-config shape; `configs.recommended` is still eslintrc.
    extends: [reactHooks.configs.flat["recommended-latest"]],
    plugins: { "react-refresh": reactRefresh },
    languageOptions: { globals: globals.browser },
    rules: {
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // --- Worker / Durable Object ----------------------------------------------------------
  {
    files: ["apps/server/src/**/*.ts"],
    languageOptions: { globals: { ...globals.worker, ...globals.node } },
  },

  // --- Files outside every tsconfig.json's `include` ------------------------------------
  // projectService only discovers files through a `tsconfig.json`, so the two purpose-built
  // configs have to be pointed at explicitly. They still get full type-aware linting.
  {
    files: ["apps/server/scripts/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ["./apps/server/tsconfig.scripts.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["apps/web/vite.config.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ["./apps/web/tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // --- Node scripts and tests -----------------------------------------------------------
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/scripts/**", "*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/scripts/**/*.mjs", "eslint.config.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  prettier,
);
