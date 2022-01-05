module.exports = {
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint'],
	settings: {
		'svelte3/typescript': require('typescript'),
	},
	rules: {
		curly: 'error',
		'no-else-return': 'error',
		'no-lonely-if': 'error',
	},
};
