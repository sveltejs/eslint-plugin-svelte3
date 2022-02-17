import { new_block, get_translation } from './block.js';
import { processor_options } from './processor_options.js';
import { state } from './state.js';
import { DocumentMapper } from './mapping.js';

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
// let-declaration that (when using TypeScript) is able to infer the type value of a autosubscribed store
const make_let = (name, is_typescript) =>
	is_typescript && name[0] === '$' ?
	// Disable eslint on that line because it may result in a "used before defined" error
	`declare let ${name}:Parameters<Parameters<typeof ${name.slice(1)}.subscribe>[0]>[0]; // eslint-disable-line\n` :
	`let ${name};`;

	// ignore_styles when a `lang=` or `type=` attribute is present on the <style> tag
const ignore_styles_fallback = ({ type, lang }) => !!type || !!lang;

// extract scripts to lint from component definition
export const preprocess = text => {
	const compiler = processor_options.custom_compiler || default_compiler || (default_compiler = require('svelte/compiler'));
	const ignore_styles = processor_options.ignore_styles ? processor_options.ignore_styles : ignore_styles_fallback;
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
		result = compile_code(text, compiler, processor_options);
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

	const references_and_reassignments = `\n;{${vars.filter(v => v.referenced || v.name[0] === '$').map(v => v.name)};${vars.filter(v => v.reassigned || v.export_name).map(v => v.name + '=0')}}`;
	state.var_names = new Set(vars.map(v => v.name));

	// convert warnings to linting messages
	const filtered_warnings = processor_options.ignore_warnings ? warnings.filter(warning => !processor_options.ignore_warnings(warning)) : warnings;
	state.messages = filtered_warnings.map(({ code, message, start, end }) => {
		const start_pos = processor_options.typescript && start ?
			mapper.get_original_position(start) :
			start && { line: start.line, column: start.column + 1 };
		const end_pos = processor_options.typescript && end ?
			mapper.get_original_position(end) :
			end && { line: end.line, column: end.column + 1 };
		return {
			ruleId: code,
			severity: 1,
			message,
			line: start_pos && start_pos.line,
			column: start_pos && start_pos.column,
			endLine: end_pos && end_pos.line,
			endColumn: end_pos && end_pos.column,
		};
	});

	// build strings that we can send along to ESLint to get the remaining messages

	// Things to think about:
	// - not all Svelte files may be typescript -> do we need a distinction on a file basis by analyzing the attribute + a config option to tell "treat all as TS"?
	const with_file_ending = (filename) => `${filename}${processor_options.typescript ? '.ts' : '.js'}`;

	if (ast.module) {
		// block for <script context='module'>
		const block = new_block();
		state.blocks.set(with_file_ending('module'), block);

		get_translation(text, block, ast.module.content);

		if (ast.instance) {
			block.transformed_code += text.slice(ast.instance.content.start, ast.instance.content.end);
		}

		block.transformed_code += references_and_reassignments;
	}

	if (ast.instance) {
		// block for <script context='instance'>
		const block = new_block();
		state.blocks.set(with_file_ending('instance'), block);

		block.transformed_code = vars.filter(v => v.injected || !processor_options.typescript && v.module).map(v => make_let(v.name, processor_options.typescript)).join('');
		if (ast.module && processor_options.typescript) {
			block.transformed_code += text.slice(ast.module.content.start, ast.module.content.end);
		}

		get_translation(text, block, ast.instance.content);

		block.transformed_code += references_and_reassignments;
	}

	if (ast.html) {
		// block for template
		const block = new_block();
		state.blocks.set(with_file_ending('template'), block);

		if (processor_options.typescript) {
			block.transformed_code = '';
			if (ast.module) {
				block.transformed_code += text.slice(ast.module.content.start, ast.module.content.end);
			}
			if (ast.instance || vars.length) {
				block.transformed_code += '\n';
			}
			block.transformed_code += vars.filter(v => v.injected).map(v => make_let(v.name, true)).join('');
			if (ast.instance) {
				block.transformed_code += text.slice(ast.instance.content.start, ast.instance.content.end);
			}
		} else {
			block.transformed_code = vars.map(v => `let ${v.name};`).join('');
		}

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
				} else if (node.type === 'Element' || node.type === 'InlineComponent' || node.type === 'SlotTemplate') {
					node.attributes.forEach(node => node.type === 'Let' && find_contextual_names(compiler, node.expression || node.name));
				}
				if (Array.isArray(node.children)) {
					node.children.forEach(node => node.type === 'ConstTag' && find_contextual_names(compiler, node.expression.left.name));
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

		block.transformed_code += `{${vars.filter(v => v.referenced_from_script || v.name[0] === '$').map(v => v.name)}}`;
	}

	// return processed string
	return [...state.blocks].map(([filename, { transformed_code: text }]) => processor_options.named_blocks ? { text, filename } : text);
};

// https://github.com/sveltejs/svelte-preprocess/blob/main/src/transformers/typescript.ts
// TypeScript transformer for preserving imports correctly when preprocessing TypeScript files
// Only needed if TS < 4.5
const ts_import_transformer = (context) => {
	const ts = processor_options.typescript;
	const visit = (node) => {
		if (ts.isImportDeclaration(node)) {
			if (node.importClause && node.importClause.isTypeOnly) {
				return ts.createEmptyStatement();
			}

			return ts.createImportDeclaration(
				node.decorators,
				node.modifiers,
				node.importClause,
				node.moduleSpecifier,
			);
		}

		return ts.visitEachChild(node, (child) => visit(child), context);
	};

	return (node) => ts.visitNode(node, visit);
};

// How it works for JS:
// 1. compile code
// 2. return ast/vars/warnings
// How it works for TS:
// 1. transpile script contents from TS to JS
// 2. compile result to get Svelte compiler warnings and variables
// 3. provide a mapper to map those warnings back to its original positions
// 4. blank script contents
// 5. parse the source to get the AST
// 6. return AST of step 5, warnings and vars of step 2
function compile_code(text, compiler, processor_options) {
	const ts = processor_options.typescript;
	if (!ts) {
		return compiler.compile(text, { generate: false, ...processor_options.compiler_options });
	} else {
		const ts_options = {
			reportDiagnostics: false,
			compilerOptions: {
				target: ts.ScriptTarget.ESNext,
				importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Preserve,
				sourceMap: true
			},
			transformers: {
				before: [ts_import_transformer]
			}
		};

		// See if we can use `preserveValueImports` instead of the transformer (TS >= 4.5)
		const ts_version = ts.version.split('.').map(str => parseInt(str, 10));
		if (ts_version[0] > 4 || (ts_version[0] === 4 && ts_version[1] >= 5)) {
			ts_options.compilerOptions.preserveValueImports = true;
			ts_options.transformers = {};
		}

		const diffs = [];
		let accumulated_diff = 0;
		const transpiled = text.replace(/<script(\s[^]*?)?>([^]*?)<\/script>/gi, (match, attributes = '', content) => {
			const output = ts.transpileModule(content, ts_options);
			const original_start = text.indexOf(content);
			const generated_start = accumulated_diff + original_start;
			accumulated_diff += output.outputText.length - content.length;
			diffs.push({
				original_start: original_start,
				generated_start: generated_start,
				generated_end: generated_start + output.outputText.length,
				diff: output.outputText.length - content.length,
				original_content: content,
				generated_content: output.outputText,
				map: output.sourceMapText
			});
			return `<script${attributes}>${output.outputText}</script>`;
		});
		const mapper = new DocumentMapper(text, transpiled, diffs);

		let ts_result;
		try {
			ts_result = compiler.compile(transpiled, { generate: false, ...processor_options.compiler_options });
		} catch (err) {
			// remap the error to be in the correct spot and rethrow it
			err.start = mapper.get_original_position(err.start);
			err.end = mapper.get_original_position(err.end);
			throw err;
		}

		text = text.replace(/<script(\s[^]*?)?>([^]*?)<\/script>/gi, (match, attributes = '', content) => {
			return `<script${attributes}>${content
				// blank out the content
				.replace(/[^\n]/g, ' ')
				// excess blank space can make the svelte parser very slow (sec->min). break it up with comments (works in style/script)
				.replace(/[^\n][^\n][^\n][^\n]\n/g, '/**/\n')
			}</script>`;
		});
		// if we do a full recompile Svelte can fail due to the blank script tag not declaring anything
		// so instead we just parse for the AST (which is likely faster, anyways)
		const ast = compiler.parse(text, { ...processor_options.compiler_options });
		const { warnings, vars } = ts_result;
		return { ast, warnings, vars, mapper };
	}
}
