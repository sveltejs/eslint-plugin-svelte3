'use strict';

const blocks = new Map();
const new_block = () => ({ transformed_code: '', line_offsets: null, translations: new Map() });
let custom_compiler, default_compiler, compiler_options, messages, ignore_warnings, ignore_styles, var_names;

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
const transform_message = ({ transformed_code }, { unoffsets, dedent, offsets, range }, message) => {
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
};

// get translation info and include the processed scripts in this block's transformed_code
const get_translation = (text, block, node, options = {}) => {
	block.transformed_code += '\n';
	const translation = { options, unoffsets: get_offsets(block.transformed_code) };
	translation.range = [node.start, node.end];
	const { dedented, offsets } = dedent_code(text.slice(node.start, node.end));
	block.transformed_code += dedented;
	translation.offsets = get_offsets(text.slice(0, node.start));
	translation.dedent = offsets;
	const end = get_offsets(block.transformed_code).lines;
	for (let i = translation.unoffsets.lines; i <= end; i++) {
		block.translations.set(i, translation);
	}
	block.transformed_code += '\n';
};

// find the contextual name or names described by a particular node in the AST
const contextual_names = [];
const find_contextual_names = (compiler, node) => {
	if (node) {
		if (typeof node === 'string') {
			contextual_names.push(node);
		} else if (typeof node === 'object') {
			compiler.walk(node, {
				enter(node, parent, prop) {
					if (node.name && prop !== 'key') {
						contextual_names.push(node.name);
					}
				},
			});
		}
	}
};

// extract scripts to lint from component definition
const preprocess = text => {
	const compiler = custom_compiler || default_compiler || (default_compiler = require('svelte/compiler'));
	if (ignore_styles) {
		// wipe the appropriate <style> tags in the file
		text = text.replace(/<style(\s[^]*?)?>[^]*?<\/style>/gi, (match, attributes = '') => {
			const attrs = {};
			attributes.split(/\s+/).filter(Boolean).forEach(attr => {
				const p = attr.indexOf('=');
				if (p === -1) {
					attrs[attr] = true;
				} else {
					attrs[attr.slice(0, p)] = '\'"'.includes(attr[p + 1]) ? attr.slice(p + 2, -1) : attr.slice(p + 1);
				}
			});
			return ignore_styles(attrs) ? match.replace(/\S/g, ' ') : match;
		});
	}
	// get information about the component
	let result;
	try {
		result = compiler.compile(text, { generate: false, ...compiler_options });
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
	const references_and_reassignments = `{${vars.filter(v => v.referenced).map(v => v.name)};${vars.filter(v => v.reassigned || v.export_name).map(v => v.name + '=0')}}`;
	var_names = new Set(vars.map(v => v.name));

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

	// build strings that we can send along to ESLint to get the remaining messages

	if (ast.module) {
		// block for <script context='module'>
		const block = new_block();
		blocks.set('module.js', block);

		get_translation(text, block, ast.module.content);

		if (ast.instance) {
			block.transformed_code += text.slice(ast.instance.content.start, ast.instance.content.end);
		}

		block.transformed_code += references_and_reassignments;
	}

	if (ast.instance) {
		// block for <script context='instance'>
		const block = new_block();
		blocks.set('instance.js', block);

		block.transformed_code = vars.filter(v => v.injected || v.module).map(v => `let ${v.name};`).join('');

		get_translation(text, block, ast.instance.content);

		block.transformed_code += references_and_reassignments;
	}

	if (ast.html) {
		// block for template
		const block = new_block();
		blocks.set('template.js', block);

		block.transformed_code = vars.map(v => `let ${v.name};`).join('');

		const nodes_with_contextual_scope = new WeakSet();
		let in_quoted_attribute = false;
		compiler.walk(ast.html, {
			enter(node, parent, prop) {
				if (prop === 'expression') {
					return this.skip();
				} else if (prop === 'attributes' && '\'"'.includes(text[node.end - 1])) {
					in_quoted_attribute = true;
				}
				contextual_names.length = 0;
				find_contextual_names(compiler, node.context);
				if (node.type === 'EachBlock') {
					find_contextual_names(compiler, node.index);
				} else if (node.type === 'ThenBlock') {
					find_contextual_names(compiler, parent.value);
				} else if (node.type === 'CatchBlock') {
					find_contextual_names(compiler, parent.error);
				} else if (node.type === 'Element' || node.type === 'InlineComponent') {
					node.attributes.forEach(node => node.type === 'Let' && find_contextual_names(compiler, node.expression || node.name));
				}
				if (contextual_names.length) {
					nodes_with_contextual_scope.add(node);
					block.transformed_code += `{let ${contextual_names.map(name => `${name}=0`).join(',')};`;
				}
				if (node.expression && typeof node.expression === 'object') {
					// add the expression in question to the constructed string
					block.transformed_code += '(';
					get_translation(text, block, node.expression, { template: true, in_quoted_attribute });
					block.transformed_code += ');';
				}
			},
			leave(node, parent, prop) {
				if (prop === 'attributes') {
					in_quoted_attribute = false;
				}
				// close contextual scope
				if (nodes_with_contextual_scope.has(node)) {
					block.transformed_code += '}';
				}
			},
		});
	}

	// return processed string
	return [...blocks].map(([filename, { transformed_code: text }]) => ({ text, filename }));
};

// extract the string referenced by a message
const get_referenced_string = (block, message) => {
	if (message.line && message.column && message.endLine && message.endColumn) {
		if (!block.line_offsets) {
			block.line_offsets = [-1, -1];
			for (let i = 0; i < block.transformed_code.length; i++) {
				if (block.transformed_code[i] === '\n') {
					block.line_offsets.push(i);
				}
			}
		}
		return block.transformed_code.slice(block.line_offsets[message.line] + message.column, block.line_offsets[message.endLine] + message.endColumn);
	}
};

// extract something that looks like an identifier (not supporting unicode escape stuff) from the beginning of a string
const get_identifier = str => (str && str.match(/^[^\s!"#%&\\'()*+,\-./:;<=>?@[\\\]^`{|}~]+/) || [])[0];

// determine whether this message from ESLint is something we care about
const is_valid_message = (block, message, { options }) => {
	switch (message.ruleId) {
		case 'eol-last': return false;
		case 'indent': return !options.template;
		case 'no-labels': return get_identifier(get_referenced_string(block, message)) !== '$';
		case 'no-restricted-syntax': return message.nodeType !== 'LabeledStatement' || get_identifier(get_referenced_string(block, message)) !== '$';
		case 'no-self-assign': return !var_names.has(get_identifier(get_referenced_string(block, message)));
		case 'no-unused-labels': return get_referenced_string(block, message) !== '$';
		case 'quotes': return !options.in_quoted_attribute;
	}
	return true;
};

// transform linting messages and combine with compiler warnings
const postprocess = blocks_messages => {
	// filter messages and fix their offsets
	const blocks_array = [...blocks.values()];
	for (let i = 0; i < blocks_messages.length; i++) {
		const block = blocks_array[i];
		for (let j = 0; j < blocks_messages[i].length; j++) {
			const message = blocks_messages[i][j];
			const translation = block.translations.get(message.line);
			if (translation && is_valid_message(block, message, translation)) {
				transform_message(block, translation, message);
				messages.push(message);
			}
		}
	}

	// sort messages and return
	const sorted_messages = messages.sort((a, b) => a.line - b.line || a.column - b.column);
	blocks.clear();
	custom_compiler = ignore_warnings = ignore_styles = compiler_options = messages = var_names = null;
	return sorted_messages;
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
	const settings = config && (typeof config.extractConfig === 'function' ? config.extractConfig(options.filename) : config).settings || {};
	custom_compiler = settings['svelte3/compiler'];
	ignore_warnings = settings['svelte3/ignore-warnings'];
	ignore_styles = settings['svelte3/ignore-styles'];
	compiler_options = settings['svelte3/compiler-options'];
	// call original Linter#verify
	return verify.call(this, code, config, options);
};

/// EXPORT THE PROCESSOR ///

exports.processors = { svelte3: { preprocess, postprocess, supportsAutofix: true } };
