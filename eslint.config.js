// ESLint flat config (ticket: "add ESLint + CI").
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "node_modules/*", ".expo/*", "supabase/function/*"],
  },
  {
    rules: {
      // The codebase intentionally uses `any` at Supabase join boundaries
      // until `supabase gen types` output is adopted (follow-up).
      "@typescript-eslint/no-explicit-any": "off",
      // Pre-existing patterns in the starter (tab-icon factories, copy with
      // apostrophes, virtual global.css import handled by uniwind/metro):
      "react/display-name": "off",
      "react/no-unescaped-entities": "off",
      "import/no-unresolved": ["error", { ignore: ["\\.css$"] }],
    },
  },
]);
