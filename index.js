'use strict';

const { compile } = require('svelte/compiler');

let compiler_options, messages, transformed_code, ignore_warnings, module_info, instance_info;

// get the total length, number of lines, and length of the last line of a string
const get_offsets = str => {
	const { length } = str;
	let lines = 1;
	let last = 0;
	for (let i = 0; i < length; i++) {
		if (str[i] === '\n') {
			lines++;
			last = 0;
		} else {
			last++;
		}
	}
	return { length, lines, last };
};

// dedent a script block, and get offsets necessary to later adjust linting messages about the block
const dedent_code = str => {
	let indentation = '';
	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		if (char === '\n' || char === '\r') {
			indentation = '';
		} else if (char === ' ' || char === '\t') {
			indentation += str[i];
		} else {
			break;
		}
	}
	const { length } = indentation;
	let dedented = '';
	const offsets = [];
	const total_offsets = [0];
	for (let i = 0; i < str.length; i++) {
		if (i === 0 || str[i - 1] === '\n') {
			if (str.slice(i, i + length) === indentation) {
				i += length;
				offsets.push(length);
			} else {
				offsets.push(0);
			}
			total_offsets.push(total_offsets[total_offsets.length - 1] + offsets[offsets.length - 1]);
		}
		dedented += str[i];
	}
	return { dedented, offsets: { offsets, total_offsets } };
};

// transform a linting message according to the module/instance script info we've gathered
const transform_message = (message, { unoffsets, dedent, offsets, range }) => {
	// strip out the start and end of the fix if they are not actually changes
	if (message.fix) {
		while (transformed_code[message.fix.range[0]] === message.fix.text[0]) {
			message.fix.range[0]++;
			message.fix.text = message.fix.text.slice(1);
		}
		while (transformed_code[message.fix.range[1] - 1] === message.fix.text[message.fix.text.length - 1]) {
			message.fix.range[1]--;
			message.fix.text = message.fix.text.slice(0, -1);
		}
	}
	// shift position reference backward according to unoffsets
	{
		const { length, lines, last } = unoffsets;
		if (message.line === lines) {
			message.column -= last;
		}
		if (message.endColumn && message.endLine === lines) {
			message.endColumn -= last;
		}
		message.line -= lines - 1;
		if (message.endLine) {
			message.endLine -= lines - 1;
		}
		if (message.fix) {
			message.fix.range[0] -= length;
			message.fix.range[1] -= length;
		}
	}
	// adjust position reference according to the previous dedenting
	{
		const { offsets, total_offsets } = dedent;
		message.column += offsets[message.line - 1];
		if (message.endColumn) {
			message.endColumn += offsets[message.endLine - 1];
		}
		if (message.fix) {
			message.fix.range[0] += total_offsets[message.line];
			message.fix.range[1] += total_offsets[message.line];
		}
	}
	// shift position reference forward according to offsets
	{
		const { length, lines, last } = offsets;
		if (message.line === 1) {
			message.column += last;
		}
		if (message.endColumn && message.endLine === 1) {
			message.endColumn += last;
		}
		message.line += lines - 1;
		if (message.endLine) {
			message.endLine += lines - 1;
		}
		if (message.fix) {
			message.fix.range[0] += length;
			message.fix.range[1] += length;
		}
	}
	// make sure the fix doesn't include anything outside the range of the script
	if (message.fix) {
		if (message.fix.range[0] < range[0]) {
			message.fix.text = message.fix.text.slice(range[0] - message.fix.range[0]);
			message.fix.range[0] = range[0];
		}
		if (message.fix.range[1] > range[1]) {
			message.fix.text = message.fix.text.slice(0, range[1] - message.fix.range[1]);
			message.fix.range[1] = range[1];
		}
	}
	return message;
};

/// PRE- AND POSTPROCESSING FUNCTIONS FOR SVELTE COMPONENTS ///

// extract scripts to lint from component definition
const preprocess = text => {
	// get information about the component
	let result;
	try {
		result = compile(text, compiler_options);
	} catch ({ name, message, start, end }) {
		// convert the error to a linting message, store it, and return
		messages = [
			{
				ruleId: name,
				severity: 2,
				message,
				line: start && start.line,
				column: start && start.column + 1,
				endLine: end && end.line,
				endColumn: end && end.column + 1,
			},
		];
		return [];
	}
	const { ast, warnings, vars } = result;
	const injected_vars = vars.filter(v => v.injected);
	const referenced_vars = vars.filter(v => v.referenced);
	const reassigned_vars = vars.filter(v => v.reassigned || v.export_name);

	// convert warnings to linting messages
	messages = (ignore_warnings ? warnings.filter(({ code }) => !ignore_warnings(code)) : warnings).map(({ code, message, start, end }) => ({
		ruleId: code,
		severity: 1,
		message,
		line: start && start.line,
		column: start && start.column + 1,
		endLine: end && end.line,
		endColumn: end && end.column + 1,
	}));

	if (!ast.module && !ast.instance) {
		return [];
	}

	// build a string that we can send along to ESLint to get the remaining messages

	// include declarations of all injected identifiers
	transformed_code = injected_vars.length ? `/* eslint-disable */let ${injected_vars.map(v => v.name).join(',')};\n/* eslint-enable */` : '';

	// get module_info/instance_info and include the processed scripts in transformed_code
	const get_info = script => {
		const info = { unoffsets: get_offsets(transformed_code) };
		const { content } = script;
		info.range = [content.start, content.end];
		const { dedented, offsets } = dedent_code(text.slice(content.start, content.end));
		transformed_code += dedented;
		info.offsets = get_offsets(text.slice(0, content.start));
		info.dedent = offsets;
		return info;
	};
	module_info = ast.module && get_info(ast.module);
	transformed_code += '/* eslint-disable */\n/* eslint-enable */';
	instance_info = ast.instance && get_info(ast.instance);
	transformed_code += '/* eslint-disable */';

	// no-unused-vars: create references to all identifiers referred to by the template
	if (referenced_vars.length) {
		transformed_code += `\n{${referenced_vars.map(v => v.name).join(';')}}`;
	}

	// prefer-const: create reassignments for all vars reassigned in component and for all exports
	if (reassigned_vars.length) {
		transformed_code += `\n{${reassigned_vars.map(v => v.name + '=0').join(';')}}`;
	}

	// return processed string
	return [transformed_code];
};

// transform linting messages and combine with compiler warnings
const postprocess = ([raw_messages]) => {
	// filter messages and fix their offsets
	if (raw_messages) {
		for (let i = 0; i < raw_messages.length; i++) {
			const message = raw_messages[i];
			if (message.ruleId !== 'no-self-assign' && (message.ruleId !== 'no-unused-labels' || !message.message.includes("'$:'"))) {
				if (instance_info && message.line >= instance_info.unoffsets.lines) {
					messages.push(transform_message(message, instance_info));
				} else if (module_info) {
					messages.push(transform_message(message, module_info));
				}
			}
		}
	}

	// sort messages and return
	return messages.sort((a, b) => a.line - b.line || a.column - b.column);
};

/// PATCH THE LINTER - THE PLUGIN PART OF THE PLUGIN ///

// find Linter instance
const linter_path = Object.keys(require.cache).find(path => path.endsWith('/eslint/lib/linter.js') || path.endsWith('\\eslint\\lib\\linter.js'));
if (!linter_path) {
	throw new Error('Could not find ESLint Linter in require cache');
}
const Linter = require(linter_path);

// get a setting from the ESLint config
const get_setting_function = (config, key, default_value) => {
	if (!config || !config.settings || !(key in config.settings)) {
		return default_value;
	}
	const value = config.settings[key];
	return typeof value === 'function' ? value :
		typeof value === 'boolean' || typeof value === 'object' ? () => value :
			Array.isArray(value) ? Array.prototype.includes.bind(value) :
				v => v === value;
};

// patch Linter#verify
const { verify } = Linter.prototype;
Linter.prototype.verify = function(code, config, options) {
	if (typeof options === 'string') {
		options = { filename: options };
	}
	if (options && options.filename) {
		if (get_setting_function(config, 'svelte3/enabled', n => n.endsWith('.svelte'))(options.filename)) {
			// lint this Svelte file
			options = Object.assign({}, options, { preprocess, postprocess });
			ignore_warnings = get_setting_function(config, 'svelte3/ignore-warnings', false);
			const ignore_styles = get_setting_function(config, 'svelte3/ignore-styles', false);
			if (ignore_styles) {
				// wipe the appropriate <style> tags in the file
				code = code.replace(/<style(\s[^]*?)?>[^]*?<\/style>/gi, (match, attributes = '') => {
					const attrs = {};
					attributes.split(/\s+/).filter(Boolean).forEach(attr => {
						const [name, value] = attr.split('=');
						attrs[name] = value ? /^['"]/.test(value) ? value.slice(1, -1) : value : true;
					});
					return ignore_styles(attrs) ? match.replace(/\S/g, ' ') : match;
				});
			}
			const compiler_options_setting = get_setting_function(config, 'svelte3/compiler-options', false);
			compiler_options = compiler_options_setting ? Object.assign({ generate: false }, compiler_options_setting(options.filename)) : { generate: false };
		}
	}

	// call original Linter#verify
	return verify.call(this, code, config, options);
};
