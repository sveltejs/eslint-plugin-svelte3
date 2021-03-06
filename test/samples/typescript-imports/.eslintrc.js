module.exports = {
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint'],
	settings: {
		'svelte3/typescript': () => require('typescript'),
	},
	rules: {
		'no-unused-vars': 'error',
	},
};
