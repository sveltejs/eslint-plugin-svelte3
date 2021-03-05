module.exports = {
	parser: '@typescript-eslint/parser',
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
	plugins: ['@typescript-eslint'],
	settings: {
		'svelte3/typescript': true,
	},
	rules: {
		indent: ['error', 'tab'],
		semi: 'error',
	},
};
