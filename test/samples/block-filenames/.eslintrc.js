module.exports = {
	rules: {
		curly: 'error',
		'no-undef': 'error',
	},
	settings: {
		'svelte3/named-blocks': true
	},
	overrides: [
		{
			files: ['**/*.svelte/*_template.js'],
			rules: {
				curly: 'off',
			},
		},
		{
			files: ['**/*.svelte/*_module.js'],
			rules: {
				'no-undef': 'off',
			},
		},
	],
};
