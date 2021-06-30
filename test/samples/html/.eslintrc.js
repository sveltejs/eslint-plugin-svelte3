module.exports = {
  rules: {
    "no-undef": "error",
    "custom-rules/html-example": "error",
  },
  parser: '@typescript-eslint/parser',
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  plugins: ['@typescript-eslint', "custom-rules"],
  settings: {
    'svelte3/typescript': require('typescript'),
    "svelte3/ignore-warnings": ({ code }) => code === "missing-declaration",
    "svelte3/named-blocks": true,
    "svelte3/ignore-styles": () => true,
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
};
