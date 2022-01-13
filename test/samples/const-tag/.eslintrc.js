module.exports = {
	rules: {
		'no-undef': 'error',
	},
	settings: {
		'svelte3/ignore-warnings': ({ code }) => code === 'missing-declaration',
	},
};
