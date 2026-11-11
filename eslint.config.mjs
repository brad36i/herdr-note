export default [{
  ignores: [".validation/**", "**/*.d.ts"],
}, {
  files: ["**/*.js", "**/*.mjs"],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    globals: { localStorage: "readonly", console: "readonly", process: "readonly", URL: "readonly" },
  },
  rules: {
    "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    "no-undef": "error",
    "no-unreachable": "error",
    "no-constant-condition": "error",
    "constructor-super": "error",
    "valid-typeof": "error",
  },
}];
