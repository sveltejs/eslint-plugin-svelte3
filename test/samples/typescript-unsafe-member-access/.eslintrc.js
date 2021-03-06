module.exports = {
	parser: "@typescript-eslint/parser",
	plugins: [
	  "@typescript-eslint",
	],
	parserOptions: {
	  project: ["./tsconfig.json"],
	  tsconfigRootDir: __dirname,
	  extraFileExtensions: [".svelte"],
	},
	settings: {
	  "svelte3/typescript": () => require('typescript'),
	},
	rules: {
	  "@typescript-eslint/no-unsafe-member-access": "error",
	},
};
