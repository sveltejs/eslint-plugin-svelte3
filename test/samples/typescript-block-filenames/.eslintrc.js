module.exports = {
	parser: '@typescript-eslint/parser',
	extends: ['plugin:@typescript-eslint/recommended'],
	plugins: ['@typescript-eslint'],
	overrides: [
		{
			files: ['**/*.svelte/*_template.ts'],
			rules: {
				curly: 'off',
			},
		},
		{
			files: ['**/*.svelte/*_module.ts'],
			rules: {
				'no-undef': 'off',
			},
		},
	],
	settings: {
		'svelte3/typescript': () => require('typescript'),
		'svelte3/named-blocks': true,
	},
	rules: {
		curly: 'error',
		'no-undef': 'error',
	},
};
