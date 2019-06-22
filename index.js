'use strict';

const { compile, walk } = require('svelte/compiler');

let compiler_options, messages, transformed_code, ignore_warnings, ignore_styles, translations;

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
	if (message.line < unoffsets.lines) {
		return false;
	}
	// strip out the start and end of the fix if they are not actually changes
	if (message.fix) {
		while (message.fix.range[0] < message.fix.range[1] && transformed_code[message.fix.range[0]] === message.fix.text[0]) {
			message.fix.range[0]++;
			message.fix.text = message.fix.text.slice(1);
		}
		while (message.fix.range[0] < message.fix.range[1] && transformed_code[message.fix.range[1] - 1] === message.fix.text[message.fix.text.length - 1]) {
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
	return true;
};

/// PRE- AND POSTPROCESSING FUNCTIONS FOR SVELTE COMPONENTS ///

// extract scripts to lint from component definition
const preprocess = text => {
	if (ignore_styles) {
		// wipe the appropriate <style> tags in the file
		text = text.replace(/<style(\s[^]*?)?>[^]*?<\/style>/gi, (match, attributes = '') => {
			const attrs = {};
			attributes.split(/\s+/).filter(Boolean).forEach(attr => {
				const [name, value] = attr.split('=');
				attrs[name] = value ? /^['"]/.test(value) ? value.slice(1, -1) : value : true;
			});
			return ignore_styles(attrs) ? match.replace(/\S/g, ' ') : match;
		});
	}
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
	messages = (ignore_warnings ? warnings.filter(warning => !ignore_warnings(warning)) : warnings).map(({ code, message, start, end }) => ({
		ruleId: code,
		severity: 1,
		message,
		line: start && start.line,
		column: start && start.column + 1,
		endLine: end && end.line,
		endColumn: end && end.column + 1,
	}));

	// build a string that we can send along to ESLint to get the remaining messages

	// include declarations of all injected identifiers
	transformed_code = injected_vars.length ? `/* eslint-disable */let ${injected_vars.map(v => v.name).join(',')};\n/* eslint-enable */` : '';

	// get translation info and include the processed scripts in transformed_code
	const get_translation = node => {
		const translation = { unoffsets: get_offsets(transformed_code) };
		translation.range = [node.start, node.end];
		const { dedented, offsets } = dedent_code(text.slice(node.start, node.end));
		transformed_code += dedented;
		translation.offsets = get_offsets(text.slice(0, node.start));
		translation.dedent = offsets;
		translations.push(translation);
	};

	translations = [];
	if (ast.module) {
		get_translation(ast.module.content);
	}
	transformed_code += '/* eslint-disable */\n/* eslint-enable */';
	if (ast.instance) {
		get_translation(ast.instance.content);
	}
	transformed_code += '/* eslint-disable */';

	// no-unused-vars: create references to all identifiers referred to by the template
	if (referenced_vars.length) {
		transformed_code += `\n{${referenced_vars.map(v => v.name).join(';')}}`;
	}

	// prefer-const: create reassignments for all vars reassigned in component and for all exports
	if (reassigned_vars.length) {
		transformed_code += `\n{${reassigned_vars.map(v => v.name + '=0').join(';')}}`;
	}

	// add expressions from template to the constructed string
	if (ast.html) {
		transformed_code += '\n/* eslint-enable *//* eslint indent: 0, quotes: 0, semi: 0 */';
		// find all expressions in the AST
		walk(ast.html, {
			enter(node, parent, prop) {
				if (prop === 'expression') {
					this.skip();
				}
				if (node.context && typeof node.context === 'object') {
					// find all the variables declared in this context
					const names = [];
					walk(node.context, {
						enter(node, parent, prop) {
							if (node.name && prop !== 'key') {
								names.push(node.name);
							}
						},
					});
					transformed_code += `/* eslint-disable */{${names.map(name => `let ${name}=0;`).join('')}/* eslint-enable */\n`;
				}
				if (node.index && typeof node.index === 'string') {
					// declare the index variable, if present
					transformed_code += `/* eslint-disable */{let ${node.index}=0;/* eslint-enable */\n`;
				}
				if (node.expression && typeof node.expression === 'object') {
					// add the expression in question to the constructed string
					get_translation(node.expression);
					transformed_code += ';\n';
				}
			},
			leave(node) {
				// close nested scopes created for context or index
				if (node.context && typeof node.context === 'object') {
					transformed_code += '/* eslint-disable */}/* eslint-enable */\n';
				}
				if (node.index && typeof node.index === 'string') {
					transformed_code += '/* eslint-disable */}/* eslint-enable */\n';
				}
			},
		});
	}

	// reverse sort the translations
	translations.sort((a, b) => b.unoffsets.length - a.unoffsets.length);

	// return processed string
	return [transformed_code];
};

// determine whether this message from ESLint is something we care about
const is_valid_message = message => {
	switch (message.ruleId) {
		case 'no-labels': return false;
		case 'no-restricted-syntax': return message.nodeType !== 'LabeledStatement';
		case 'no-self-assign': return false;
		case 'no-unused-labels': return !message.message.includes("'$:'");
	}
	return true;
};

// transform linting messages and combine with compiler warnings
const postprocess = ([raw_messages]) => {
	// filter messages and fix their offsets
	if (raw_messages) {
		for (let i = 0; i < raw_messages.length; i++) {
			const message = raw_messages[i];
			if (is_valid_message(message)) {
				for (let k = 0; k < translations.length; k++) {
					if (transform_message(message, translations[k])) {
						messages.push(message);
						break;
					}
				}
			}
		}
	}

	// sort messages and return
	return messages.sort((a, b) => a.line - b.line || a.column - b.column);
};

/// PATCH THE LINTER - HACK TO GET ACCESS TO SETTINGS ///

// find Linter instance
const linter_path = Object.keys(require.cache).find(path => path.endsWith('/eslint/lib/linter/linter.js') || path.endsWith('\\eslint\\lib\\linter\\linter.js'));
if (!linter_path) {
	throw new Error('Could not find ESLint Linter in require cache');
}
const { Linter } = require(linter_path);

// patch Linter#verify
const { verify } = Linter.prototype;
Linter.prototype.verify = function(code, config, options) {
	// fetch settings
	const settings = config ? (typeof config.extractConfig === 'function' ? config.extractConfig(options.filename || options).settings : config.settings) || {} : {};
	ignore_warnings = settings['svelte3/ignore-warnings'];
	ignore_styles = settings['svelte3/ignore-styles'];
	compiler_options = Object.assign({ generate: false }, settings['svelte3/compiler-options']);
	// call original Linter#verify
	return verify.call(this, code, config, options);
};

/// EXPORT THE PROCESSOR ///

exports.processors = { svelte3: { preprocess, postprocess, supportsAutofix: true } };
