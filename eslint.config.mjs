import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // ── TypeScript rules (re-enabled where safe) ──────────────
    "@typescript-eslint/no-explicit-any": "off", // keep off — gradual migration
    "@typescript-eslint/no-unused-vars": ["warn", {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    }],
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",

    // ── React rules ────────────────────────────────────────────
    "react-hooks/exhaustive-deps": "warn", // re-enable as warning
    "react-hooks/purity": "off",
    "react-hooks/set-state-in-effect": "warn",
    "react-hooks/static-components": "warn",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // ── Next.js rules ──────────────────────────────────────────
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // ── General JS rules (re-enabled for safety) ───────────────
    "prefer-const": "warn",
    "no-unused-vars": "off", // use TS version instead
    "no-console": ["warn", { allow: ["warn", "error"] }],
    "no-debugger": "warn",
    "no-empty": "warn",
    "no-irregular-whitespace": "warn",
    "no-case-declarations": "off",
    "no-fallthrough": "warn",
    "no-mixed-spaces-and-tabs": "warn",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "warn",
    "no-useless-escape": "off",
  },
}, {
  ignores: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "examples/**",
    "skills/**",
    "research-export/**",
    "upload/**",
    "download/**",
    "tool-results/**",
    "mini-services/**",
    "tests/**",
    "workspace/**",
  ],
}];

export default eslintConfig;
