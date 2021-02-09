import { new_block, get_translation } from './block.js';
import { processor_options } from './processor_options.js';
import { state } from './state.js';
import { DocumentMapper } from './mapping';

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
		result = compileCode(text, compiler, processor_options);
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
	const { ast, warnings, vars, mapper } = result;

	const references_and_reassignments = `{${vars.filter(v => v.referenced).map(v => v.name)};${vars.filter(v => v.reassigned || v.export_name).map(v => v.name + '=0')}}`;
	state.var_names = new Set(vars.map(v => v.name));

	// convert warnings to linting messages
	const filteredWarnings = processor_options.ignore_warnings ? warnings.filter(warning => !processor_options.ignore_warnings(warning)) : warnings;
	state.messages = filteredWarnings.map(({ code, message, start, end }) => {
		const startPos = processor_options.typescript && start ?
			mapper.getOriginalPosition(start) :
			start && { line: start.line, column: start.column + 1 };
		const endPos = processor_options.typescript && end ?
			mapper.getOriginalPosition(end) :
			end && { line: end.line, column: end.column + 1 };
		return {
			ruleId: code,
			severity: 1,
			message,
			line: startPos && startPos.line,
			column: startPos && startPos.column,
			endLine: endPos && endPos.line,
			endColumn: endPos && endPos.column,
		};
	});

	// build strings that we can send along to ESLint to get the remaining messages
	
	// Things to think about:
	// - not all Svelte files may be typescript -> do we need a distinction on a file basis by analyzing the attribute + a config option to tell "treat all as TS"?
	const withFileEnding = (fileName) => `${fileName}${processor_options.typescript ? '.ts' : '.js'}`;

	if (ast.module) {
		// block for <script context='module'>
		const block = new_block();
		state.blocks.set(withFileEnding('module'), block);

		get_translation(text, block, ast.module.content);

		if (ast.instance) {
			block.transformed_code += text.slice(ast.instance.content.start, ast.instance.content.end);
		}

		block.transformed_code += references_and_reassignments;
	}

	if (ast.instance) {
		// block for <script context='instance'>
		const block = new_block();
		state.blocks.set(withFileEnding('instance'), block);

		block.transformed_code = vars.filter(v => v.injected || v.module).map(v => `let ${v.name};`).join('');

		get_translation(text, block, ast.instance.content);

		block.transformed_code += references_and_reassignments;
	}

	if (ast.html) {
		// block for template
		const block = new_block();
		state.blocks.set(withFileEnding('template'), block);

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

function compileCode(text, compiler, processor_options) {
	let ast;
	let warnings;
	let vars;

	let mapper;
	let ts_result;
	if (processor_options.typescript) {
		const diffs = [];
		const transpiled = text.replace(/<script(\s[^]*?)?>([^]*?)<\/script>/gi, (match, attributes = '', content) => {
			const output = processor_options.typescript.transpileModule(
				content,
				{ reportDiagnostics: false, compilerOptions: { target: processor_options.typescript.ScriptTarget.ESNext, sourceMap: true } }
			);
			const prevDiff = diffs.length ? diffs[diffs.length - 1].accumulatedDiff : 0;
			const originalStart = text.indexOf(content);
			const generatedStart = prevDiff + originalStart;
			diffs.push({
				originalStart: originalStart,
				originalEnd: originalStart + content.length,
				generatedStart: generatedStart,
				generatedEnd: generatedStart + output.outputText.length,
				diff: output.outputText.length - content.length,
				accumulatedDiff: prevDiff + output.outputText.length - content.length,
				originalContent: content,
				generatedContent: output.outputText,
				map: output.sourceMapText
			});
			return `<script${attributes}>${output.outputText}</script>`;
		});
		mapper = new DocumentMapper(text, transpiled, diffs);
		ts_result = compiler.compile(transpiled, { generate: false, ...processor_options.compiler_options });

		text = text.replace(/<script(\s[^]*?)?>([^]*?)<\/script>/gi, (match, attributes = '', content) => {
			return `<script${attributes}>${content
				// blank out the content
				.replace(/[^\n]/g, ' ')
				// excess blank space can make the svelte parser very slow (sec->min). break it up with comments (works in style/script)
				.replace(/[^\n][^\n][^\n][^\n]\n/g, '/**/\n')
			}</script>`;
		});
	}

	const result = compiler.compile(text, { generate: false, ...processor_options.compiler_options });

	if (!processor_options.typescript) {
		({ ast, warnings, vars } = result);
	} else {
		ast = result.ast;
		({ warnings, vars } = ts_result);
	}

	return { ast, warnings, vars, mapper };
}
