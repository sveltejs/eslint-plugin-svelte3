import { new_block, get_translation } from './block.js';
import { processor_options } from './processor_options.js';
import { state } from './state.js';

let default_compiler;

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
export const preprocess = text => {
	const compiler = processor_options.custom_compiler || default_compiler || (default_compiler = require('svelte/compiler'));
	if (processor_options.ignore_styles) {
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
			return processor_options.ignore_styles(attrs) ? match.replace(/\S/g, ' ') : match;
		});
	}
	// get information about the component
	let result;
	try {
		result = compiler.compile(text, { generate: false, ...processor_options.compiler_options });
	} catch ({ name, message, start, end }) {
		// convert the error to a linting message, store it, and return
		state.messages = [
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
	state.var_names = new Set(vars.map(v => v.name));

	// convert warnings to linting messages
	state.messages = (processor_options.ignore_warnings ? warnings.filter(warning => !processor_options.ignore_warnings(warning)) : warnings).map(({ code, message, start, end }) => ({
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
		state.blocks.set('module.js', block);

		get_translation(text, block, ast.module.content);

		if (ast.instance) {
			block.transformed_code += text.slice(ast.instance.content.start, ast.instance.content.end);
		}

		block.transformed_code += references_and_reassignments;
	}

	if (ast.instance) {
		// block for <script context='instance'>
		const block = new_block();
		state.blocks.set('instance.js', block);

		block.transformed_code = vars.filter(v => v.injected || v.module).map(v => `let ${v.name};`).join('');

		get_translation(text, block, ast.instance.content);

		block.transformed_code += references_and_reassignments;
	}

	if (ast.html) {
		// block for template
		const block = new_block();
		state.blocks.set('template.js', block);

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

		block.transformed_code += `{${vars.filter(v => v.referenced_from_script).map(v => v.name)}}`;
	}

	// return processed string
	return [...state.blocks].map(([filename, { transformed_code: text }]) => processor_options.named_blocks ? { text, filename } : text);
};
