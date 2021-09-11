export const processor_options = {};

// find Linter instance
const linter_paths = Object.keys(require.cache).filter(path => path.endsWith('/eslint/lib/linter/linter.js') || path.endsWith('\\eslint\\lib\\linter\\linter.js'));
if (!linter_paths.length) {
	throw new Error('Could not find ESLint Linter in require cache');
}
// There may be more than one instance of the linter when we're in a workspace with multiple directories.
// We first try to find the one that's inside the same node_modules directory as this plugin.
// If that can't be found for some reason, we assume the one we want is the last one in the array.
const current_node_modules_path = __dirname.replace(/(?<=[/\\]node_modules[/\\]).*$/, '')
const linter_path = linter_paths.find(path => path.startsWith(current_node_modules_path)) || linter_paths.pop();
const { Linter } = require(linter_path);

// patch Linter#verify
const { verify } = Linter.prototype;
Linter.prototype.verify = function(code, config, options) {
	// fetch settings
	const settings = config && (typeof config.extractConfig === 'function' ? config.extractConfig(options.filename) : config).settings || {};
	processor_options.preprocess = settings['svelte3/preprocess'];
	processor_options.custom_compiler = settings['svelte3/compiler'];
	processor_options.ignore_warnings = settings['svelte3/ignore-warnings'];
	processor_options.ignore_styles = settings['svelte3/ignore-styles'];
	processor_options.compiler_options = settings['svelte3/compiler-options'];
	processor_options.named_blocks = settings['svelte3/named-blocks'];
	processor_options.typescript =
		settings['svelte3/typescript'] === true
			? require('typescript')
			: typeof settings['svelte3/typescript'] === 'function'
				? settings['svelte3/typescript']()
				: settings['svelte3/typescript'];
	// call original Linter#verify
	return verify.call(this, code, config, options);
};
