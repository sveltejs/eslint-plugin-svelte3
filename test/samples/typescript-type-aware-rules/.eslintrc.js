module.exports = {
	parser: '@typescript-eslint/parser',
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
    	'plugin:@typescript-eslint/recommended-requiring-type-checking',],
	plugins: ['@typescript-eslint'],
	parserOptions: {
	  tsconfigRootDir: __dirname,
	  project: ['./tsconfig.json'],
	  extraFileExtensions: ['.svelte'],
	},
	ignorePatterns: ['.eslintrc.js'],
	settings: {
		'svelte3/typescript': () => require('typescript'),
	}
};
