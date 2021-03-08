module.exports = {
	parser: '@typescript-eslint/parser',
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
	plugins: ['@typescript-eslint'],
	settings: {
		'svelte3/typescript': require('typescript'),
	},
	rules: {
		indent: 0,
		'@typescript-eslint/indent': ['error', 'tab'],
	},
};
