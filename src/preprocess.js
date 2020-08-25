import { new_block, get_translation } from './block.js';
import { processor_options } from './processor_options.js';
import { get_line_offsets } from './utils.js';
import { state } from './state.js';

var charToInteger = {};
var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
for (var i = 0; i < chars.length; i++) {
    charToInteger[chars.charCodeAt(i)] = i;
}
function decode(mappings) {
    var generatedCodeColumn = 0; // first field
    var sourceFileIndex = 0; // second field
    var sourceCodeLine = 0; // third field
    var sourceCodeColumn = 0; // fourth field
    var nameIndex = 0; // fifth field
    var decoded = [];
    var line = [];
    var segment = [];
    for (var i = 0, j = 0, shift = 0, value = 0, len = mappings.length; i < len; i++) {
        var c = mappings.charCodeAt(i);
        if (c === 44) { // ","
            if (segment.length)
                line.push(segment);
            segment = [];
            j = 0;
        }
        else if (c === 59) { // ";"
            if (segment.length)
                line.push(segment);
            segment = [];
            j = 0;
            decoded.push(line);
            line = [];
            generatedCodeColumn = 0;
        }
        else {
            var integer = charToInteger[c];
            if (integer === undefined) {
                throw new Error('Invalid character (' + String.fromCharCode(c) + ')');
            }
            var hasContinuationBit = integer & 32;
            integer &= 31;
            value += integer << shift;
            if (hasContinuationBit) {
                shift += 5;
            }
            else {
                var shouldNegate = value & 1;
                value >>>= 1;
                if (shouldNegate) {
                    value = -value;
                    if (value === 0)
                        value = -0x80000000;
                }
                if (j == 0) {
                    generatedCodeColumn += value;
                    segment.push(generatedCodeColumn);
                }
                else if (j === 1) {
                    sourceFileIndex += value;
                    segment.push(sourceFileIndex);
                }
                else if (j === 2) {
                    sourceCodeLine += value;
                    segment.push(sourceCodeLine);
                }
                else if (j === 3) {
                    sourceCodeColumn += value;
                    segment.push(sourceCodeColumn);
                }
                else if (j === 4) {
                    nameIndex += value;
                    segment.push(nameIndex);
                }
                j++;
                value = shift = 0; // reset
            }
        }
    }
    if (segment.length)
        line.push(segment);
    decoded.push(line);
    return decoded;
}

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
export const preprocess = (text, filename) => {
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
	let result;
	let processedResult;
	let processedModule;
	let processedInstance;
	let processedStyle;
	let processedMarkup;
	let moduleExt = 'js';
	let instanceExt = 'js';
	try {
		// run preprocessor if present
		if (processor_options.svelte_preprocess) {
			const result = processor_options.svelte_preprocess(text, filename);
			if (result) {
				state.pre_line_offsets = get_line_offsets(text);
				processedResult = result.code;
				state.post_line_offsets = get_line_offsets(processedResult);
				if (result.mappings) {
					state.mappings = decode(result.mappings);
				}

				processedMarkup = result.markup;

				if (result.module) {
					processedModule = result.module;
					moduleExt = result.module.ext;
				}
				if (result.instance) {
					processedInstance = result.instance;
					instanceExt = result.instance.ext;
				}

				processedStyle = result.style;

				processor_options.named_blocks = true;
			}
		}
		// get information about the component
		result = compiler.compile(processedResult || text, { generate: false, ...processor_options.compiler_options });
		if (processedResult) {
			const { html, css, instance, module } = result.ast;

			let styleDiff = processedStyle ? processedStyle.diff : 0;
			let markupDiff = processedMarkup ? processedMarkup.diff : 0;
			let moduleDiff = processedModule ? processedModule.diff : 0;
			let instanceDiff = processedInstance ? processedInstance.diff : 0;
			
			let modulePreOffset = 0;
			let modulePostOffset = 0;
			if (module) {
				if (module.start > html.start) {
					modulePreOffset += markupDiff;
				}
				if (module.start > css.start) {
					modulePreOffset += styleDiff;
				}
				if (instance && module.start > instance.start) {
					modulePreOffset += instanceDiff;
				}

				modulePostOffset = modulePreOffset + moduleDiff;
			}
			
			let instancePreOffset = 0;
			let instancePostOffset = 0;
			if (instance) {
				if (instance.start > html.start) {
					instancePreOffset += markupDiff;
				}
				if (instance.start > css.start) {
					instancePreOffset += styleDiff;
				}
				if (module && instance.start > module.start) {
					instancePreOffset += moduleDiff;
				}

				instancePostOffset = instancePreOffset + instanceDiff;
			}

			if (module && processedModule) {
				module.content.body = processedModule.ast.body;

				module.start += modulePreOffset;
				module.end += modulePostOffset;

				module.content.start += modulePreOffset;
				module.content.end += modulePostOffset;
			}

			if (instance && processedInstance) {
				instance.content.body = processedInstance.ast.body;

				instance.start += instancePreOffset;
				instance.end += instancePostOffset;

				instance.content.start += instancePreOffset;
				instance.content.end += instancePostOffset;
			}
		}
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
		state.blocks.set(`module.${moduleExt}`, block);

		get_translation(text, block, ast.module.content);

		if (ast.instance) {
			block.transformed_code += processedResult
			? processedInstance.original
			: text.slice(ast.instance.content.start, ast.instance.content.end);
		}

		block.transformed_code += references_and_reassignments;
	}

	if (ast.instance) {
		// block for <script context='instance'>
		const block = new_block();
		state.blocks.set(`instance.${instanceExt}`, block);

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
		const htmlText = processedResult || text;

		compiler.walk(ast.html, {
			enter(node, parent, prop) {
				if (prop === 'expression') {
					return this.skip();
				} else if (prop === 'attributes' && '\'"'.includes(htmlText[node.end - 1])) {
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
					get_translation(htmlText, block, node.expression, { template: true, in_quoted_attribute });
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
	return [...state.blocks].map(([filename, { transformed_code: text }]) => processor_options.named_blocks ? { text, filename } : text);
};
