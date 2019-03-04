'use strict';

const { compile } = require('svelte/compiler');

let messages, transformedCode, ignoreWarnings, moduleInfo, instanceInfo;

// get the total length, number of lines, and length of the last line of a string
const getOffsets = str => {
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
const dedentCode = str => {
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
	const totalOffsets = [0];
	for (let i = 0; i < str.length; i++) {
		if (i === 0 || str[i - 1] === '\n') {
			if (str.slice(i, i + length) === indentation) {
				i += length;
				offsets.push(length);
			} else {
				offsets.push(0);
			}
			totalOffsets.push(totalOffsets[totalOffsets.length - 1] + offsets[offsets.length - 1]);
		}
		dedented += str[i];
	}
	return { dedented, offsets: { offsets, totalOffsets } };
};

// transform a linter message according to the module/instance script info we've gathered
const transformMessage = (message, { unoffsets, dedent, offsets, range }) => {
	// strip out the beginning and ending of the fix if they are not actually changes
	if (message.fix) {
		while (transformedCode[message.fix.range[0]] === message.fix.text[0]) {
			message.fix.range[0]++;
			message.fix.text = message.fix.text.slice(1);
		}
		while (transformedCode[message.fix.range[1] - 1] === message.fix.text[message.fix.text.length - 1]) {
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
		const { offsets, totalOffsets } = dedent;
		message.column += offsets[message.line - 1];
		if (message.endColumn) {
			message.endColumn += offsets[message.endLine - 1];
		}
		if (message.fix) {
			message.fix.range[0] += totalOffsets[message.line];
			message.fix.range[1] += totalOffsets[message.line];
		}
	}
	// shift position reference in a message forward according to offsets
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
		result = compile(text, { generate: false });
	} catch ({ name, message, start, end }) {
		// convert the error to an eslint message, store it, and return
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
	const injectedVars = vars.filter(v => v.injected);
	const referencedVars = vars.filter(v => v.referenced);
	const reassignedVars = vars.filter(v => v.reassigned || v.export_name);

	// convert warnings to eslint messages
	messages = (ignoreWarnings ? warnings.filter(({ code }) => !ignoreWarnings(code)) : warnings).map(({ code, message, start, end }) => ({
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
	transformedCode = injectedVars.length ? `let ${injectedVars.map(v => v.name).join(',')}; // eslint-disable-line\n` : '';

	// get moduleInfo/instanceInfo and include the processed scripts in str
	const getInfo = script => {
		const info = { unoffsets: getOffsets(transformedCode) };
		const { content } = script;
		info.range = [content.start, content.end];
		const { dedented, offsets } = dedentCode(text.slice(content.start, content.end));
		transformedCode += dedented;
		info.offsets = getOffsets(text.slice(0, content.start));
		info.dedent = offsets;
		return info;
	};
	moduleInfo = ast.module && getInfo(ast.module);
	transformedCode += '\n';
	instanceInfo = ast.instance && getInfo(ast.instance);

	// no-unused-vars: create references to all identifiers referred to by the template
	if (referencedVars.length) {
		transformedCode += `\n{${referencedVars.map(v => v.name).join(';')}} // eslint-disable-line`;
	}

	// prefer-const: create reassignments for all vars reassigned in component and for all exports
	if (reassignedVars.length) {
		transformedCode += `\n{${reassignedVars.map(v => v.name + '=0').join(';')}} // eslint-disable-line`;
	}

	// return processed string
	return [transformedCode];
};

// combine and transform linting messages
const postprocess = ([rawMessages]) => {
	// filter messages and fix their offsets
	if (rawMessages) {
		for (let i = 0; i < rawMessages.length; i++) {
			const message = rawMessages[i];
			if (message.ruleId !== 'no-self-assign' && (message.ruleId !== 'no-unused-labels' || !message.message.includes("'$:'"))) {
				if (instanceInfo && message.line >= instanceInfo.unoffsets.lines) {
					messages.push(transformMessage(message, instanceInfo));
				} else if (moduleInfo) {
					messages.push(transformMessage(message, moduleInfo));
				}
			}
		}
	}

	// sort messages and return
	return messages.sort((a, b) => a.line - b.line || a.column - b.column);
};

/// PATCH THE LINTER - THE PLUGIN PART OF THE PLUGIN ///

// find Linter instance
const LinterPath = Object.keys(require.cache).find(path => path.endsWith('/eslint/lib/linter.js') || path.endsWith('\\eslint\\lib\\linter.js'));
if (!LinterPath) {
	throw new Error('Could not find ESLint Linter in require cache');
}
const Linter = require(LinterPath);

// get a setting from the ESLint config
const getSettingFunction = (config, key, defaultValue) => {
	if (!config || !config.settings || !(key in config.settings)) {
		return defaultValue;
	}
	const value = config.settings[key];
	return typeof value === 'function' ? value :
		typeof value === 'boolean' ? () => value :
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
		if (getSettingFunction(config, 'svelte3/enabled', n => n.endsWith('.svelte'))(options.filename)) {
			// lint this Svelte file
			options = Object.assign({}, options, { preprocess, postprocess });
			ignoreWarnings = getSettingFunction(config, 'svelte3/ignore-warnings', false);
			const ignoreStyles = getSettingFunction(config, 'svelte3/ignore-styles', false);
			if (ignoreStyles) {
				// wipe the appropriate <style> tags in the file
				code = code.replace(/<style([^]*?)>[^]*?<\/style>/gi, (match, attributes) => {
					const attrs = {};
					attributes.split(/\s+/).filter(Boolean).forEach(attr => {
						const [name, value] = attr.split('=');
						attrs[name] = value ? /^['"]/.test(value) ? value.slice(1, -1) : value : true;
					});
					return ignoreStyles(attrs) ? match.replace(/\S/g, ' ') : match;
				});
			}
		}
	}

	// call original Linter#verify
	return verify.call(this, code, config, options);
};
