module.exports = {
  rules: {
    "no-undef": "error",
    "custom-rules/html-example": "error",
  },
  plugins: ["custom-rules"],
  settings: {
    "svelte3/ignore-warnings": ({ code }) => code === "missing-declaration",
    "svelte3/named-blocks": true,
  },
};
