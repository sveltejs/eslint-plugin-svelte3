module.exports = {
	parser: '@typescript-eslint/parser',
	extends: ['plugin:@typescript-eslint/recommended'],
	plugins: ['@typescript-eslint'],
	settings: {
		'svelte3/typescript': () => require('typescript'),
	},
};
