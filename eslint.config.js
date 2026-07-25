// @ts-check
const js = require("@eslint/js")
const tsPlugin = require("@typescript-eslint/eslint-plugin")

/**
 * Flat-config replacement for the legacy `.eslintrc.js`.
 *
 * Mirrors the old config's behavior:
 *   extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"]
 *   parser: "@typescript-eslint/parser"
 *   plugins: ["@typescript-eslint"]
 *   rules: { the same four overrides }
 *
 * Only `.ts`/`.tsx` files are linted (previously enforced via `eslint --ext .ts,.tsx`,
 * which flat config no longer supports as a CLI flag - restricting via `files` here
 * is the direct equivalent).
 *
 * `tsPlugin.configs["flat/recommended"]` bundles the parser/plugin registration,
 * plus the internal "eslint-recommended" override that disables core rules already
 * covered by the TypeScript compiler (e.g. no-undef, no-unreachable) - this is the
 * same override the old `plugin:@typescript-eslint/recommended` shareable config
 * applied, so behavior is unchanged.
 *
 * @type {import('eslint').Linter.Config[]}
 */
module.exports = [
  {
    // Flat config always applies core JS rules to `**/*.js`/`**/*.mjs`/`**/*.cjs`
    // via its implicit default, unlike the old `eslint . --ext .ts,.tsx` invocation
    // (which never linted a `.js` file at all - `--ext` is a no-op in flat-config
    // mode). Ignoring JS globally restores that original ts/tsx-only scope.
    ignores: [
      "out/**",
      "vendor/**",
      "coverage/**",
      ".worktrees/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
  },
  js.configs.recommended,
  ...tsPlugin.configs["flat/recommended"],
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": 0,
      "@typescript-eslint/no-explicit-any": 0,
      "@typescript-eslint/explicit-module-boundary-types": 0,
      "@typescript-eslint/no-non-null-assertion": 0,
    },
  },
]
