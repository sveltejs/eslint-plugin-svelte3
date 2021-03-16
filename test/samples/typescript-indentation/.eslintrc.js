module.exports = {
	parser: '@typescript-eslint/parser',
	plugins: [
		'@typescript-eslint',
	],
	rules: {
		indent: 'off',
		'@typescript-eslint/indent': ['error', 'tab'],
		semi: 'error',
	},
};