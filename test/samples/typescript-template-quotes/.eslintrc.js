module.exports = {
	parser: '@typescript-eslint/parser',
	plugins: [
		'@typescript-eslint',
	],
	rules: {
		quotes: 'off',
		'@typescript-eslint/quotes': ['error', 'single']
	},
};
