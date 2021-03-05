module.exports = {
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint'],
	settings: {
		'svelte3/typescript': true,
	},
	rules: {
		'no-unused-vars': 'error',
	},
};
