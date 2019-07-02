'use strict';

const { compile, walk } = require('svelte/compiler');
const SCRIPT = 1, TEMPLATE_QUOTED = 2, TEMPLATE_UNQUOTED = 3;
let compiler_options, messages, transformed_code, line_offsets, ignore_warnings, ignore_styles, translations, var_names;

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

// find the contextual name or names described by a particular node in the AST
const contextual_names = [];
const find_contextual_names = node => {
	if (node) {
		if (typeof node === 'string') {
			contextual_names.push(node);
		} else if (typeof node === 'object') {
			walk(node, {
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
		result = compile(text, { generate: false, ...compiler_options });
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
	var_names = new Set(vars.map(v => v.name));
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
	transformed_code = injected_vars.length ? `let ${injected_vars.map(v => v.name).join(',')};\n` : '';

	// get translation info and include the processed scripts in transformed_code
	const get_translation = (node, type) => {
		const translation = { type, unoffsets: get_offsets(transformed_code) };
		translation.range = [node.start, node.end];
		const { dedented, offsets } = dedent_code(text.slice(node.start, node.end));
		transformed_code += dedented;
		translation.offsets = get_offsets(text.slice(0, node.start));
		translation.dedent = offsets;
		const end = get_offsets(transformed_code).lines;
		for (let i = translation.unoffsets.lines; i <= end; i++) {
			translations.set(i, translation);
		}
	};

	translations = new Map();
	if (ast.module) {
		get_translation(ast.module.content, SCRIPT);
	}
	transformed_code += '\n';
	if (ast.instance) {
		get_translation(ast.instance.content, SCRIPT);
	}
	transformed_code += '\n';

	// no-unused-vars: create references to all identifiers referred to by the template
	if (referenced_vars.length) {
		transformed_code += `{${referenced_vars.map(v => v.name).join(';')}}\n`;
	}

	// prefer-const: create reassignments for all vars reassigned in component and for all exports
	if (reassigned_vars.length) {
		transformed_code += `{${reassigned_vars.map(v => v.name + '=0').join(';')}}\n`;
	}

	// add expressions from template to the constructed string
	const nodes_with_contextual_scope = new WeakSet();
	let in_quoted_attribute = false;
	walk(ast.html, {
		enter(node, parent, prop) {
			if (prop === 'expression') {
				return this.skip();
			} else if (prop === 'attributes' && '\'"'.includes(text[node.end - 1])) {
				in_quoted_attribute = true;
			}
			contextual_names.length = 0;
			find_contextual_names(node.context);
			if (node.type === 'EachBlock') {
				find_contextual_names(node.index);
			} else if (node.type === 'ThenBlock') {
				find_contextual_names(parent.value);
			} else if (node.type === 'CatchBlock') {
				find_contextual_names(parent.error);
			} else if (node.type === 'Element' || node.type === 'InlineComponent') {
				node.attributes.forEach(node => node.type === 'Let' && find_contextual_names(node.expression || node.name));
			}
			if (contextual_names.length) {
				nodes_with_contextual_scope.add(node);
				transformed_code += `{let ${contextual_names.map(name => `${name}=0`).join(',')};`;
			}
			if (node.expression && typeof node.expression === 'object') {
				// add the expression in question to the constructed string
				transformed_code += '(\n';
				get_translation(node.expression, in_quoted_attribute ? TEMPLATE_QUOTED : TEMPLATE_UNQUOTED);
				transformed_code += '\n);';
			}
		},
		leave(node, parent, prop) {
			if (prop === 'attributes') {
				in_quoted_attribute = false;
			}
			// close contextual scope
			if (nodes_with_contextual_scope.has(node)) {
				transformed_code += '}';
			}
		},
	});

	// return processed string
	return [transformed_code];
};

// extract the string referenced by a message
const get_referenced_string = message => {
	if (message.line && message.column && message.endLine && message.endColumn) {
		if (!line_offsets) {
			line_offsets = [-1, -1];
			for (let i = 0; i < transformed_code.length; i++) {
				if (transformed_code[i] === '\n') {
					line_offsets.push(i);
				}
			}
		}
		return transformed_code.slice(line_offsets[message.line] + message.column, line_offsets[message.endLine] + message.endColumn);
	}
};

// extract something that looks like an identifier (minus unicode escape stuff) from the beginning of a string
const get_identifier = str => (str && str.match(/^[^\s!"#%&\\'()*+,\-./:;<=>?@[\\\]^`{|}~]+/) || [])[0];

// determine whether this message from ESLint is something we care about
const is_valid_message = (message, { type }) => {
	switch (message.ruleId) {
		case 'eol-last': return false;
		case 'indent': return type === SCRIPT;
		case 'no-labels': return get_identifier(get_referenced_string(message)) !== '$';
		case 'no-restricted-syntax': return message.nodeType !== 'LabeledStatement' || get_identifier(get_referenced_string(message)) !== '$';
		case 'no-self-assign': return !var_names.has(get_identifier(get_referenced_string(message)));
		case 'no-unused-labels': return get_referenced_string(message) !== '$';
		case 'quotes': return type !== TEMPLATE_QUOTED;
	}
	return true;
};

// transform linting messages and combine with compiler warnings
const postprocess = ([raw_messages]) => {
	// filter messages and fix their offsets
	if (raw_messages) {
		for (let i = 0; i < raw_messages.length; i++) {
			const message = raw_messages[i];
			const translation = translations.get(message.line);
			if (translation && is_valid_message(message, translation)) {
				transform_message(message, translation);
				messages.push(message);
			}
		}
	}

	// sort messages and return
	const sorted_messages = messages.sort((a, b) => a.line - b.line || a.column - b.column);
	compiler_options = messages = transformed_code = line_offsets = ignore_warnings = ignore_styles = translations = var_names = null;
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
	ignore_warnings = settings['svelte3/ignore-warnings'];
	ignore_styles = settings['svelte3/ignore-styles'];
	compiler_options = settings['svelte3/compiler-options'];
	// call original Linter#verify
	return verify.call(this, code, config, options);
};

/// EXPORT THE PROCESSOR ///

exports.processors = { svelte3: { preprocess, postprocess, supportsAutofix: true } };
