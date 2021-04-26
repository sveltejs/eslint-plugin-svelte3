module.exports = {
	settings: {
		'svelte3/preprocess': text => {
			return text.replace(/custom-style-tag/g, 'style')
		},
	},
};
