module.exports = {
	settings: {
		'svelte3/ignore-styles': attributes => attributes.foo && attributes.foo.includes('bar'),
	},
};
