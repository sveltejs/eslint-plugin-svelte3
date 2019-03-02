'use strict';

/// UTILITIES TO DEAL WITH OFFSETS TO CODE AND TO LINTING MESSAGES ///

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

// shift position references in a message forward according to given offsets
const shiftByOffsets = (message, { length, lines, last }) => {
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
	return message;
};

// shift position references in a message backward according to given offsets
const unshiftByOffsets = (message, { length, lines, last }) => {
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
	return message;
};

/// UTILITIES TO DEAL WITH INDENTATION OF SCRIPT BLOCKS ///

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
	let initialOffset = 0;
	for (let i = 0; i < str.length; i++) {
		// remove first line if it's empty (because the code is in a script tag)
		if (i === 0) {
			if (str[0] === '\n') {
				i += 1;
				initialOffset = 1;
			} else if (str.slice(0, 2) === '\r\n') {
				i += 2;
				initialOffset = 2;
			}
		}

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
	return { dedented, offsets: { offsets, totalOffsets, initialOffset } };
};

// adjust position references in a message according to the previous dedenting
const undedentCode = (message, { offsets, totalOffsets, initialOffset }) => {
	message.column += offsets[message.line - 1];
	if (message.endColumn) {
		message.endColumn += offsets[message.endLine - 1];
	}
	if (message.fix) {
		message.fix.range[0] += totalOffsets[message.line];
		message.fix.range[1] += totalOffsets[message.line];
	}

	// if there's an initial offset, need to account for first line that was removed
	const lineOffset = initialOffset === 0 ? 0 : 1;
	message.line += lineOffset;
	if (message.endLine) {
		message.endLine += lineOffset;
	}

	return message;
};

/// PRE- AND POSTPROCESSING FUNCTIONS FOR SVELTE COMPONENTS ///

const { compile } = require('svelte/compiler');

let messages, ignoreWarnings, moduleUnoffsets, moduleOffsets, instanceUnoffsets, instanceOffsets, moduleDedent, instanceDedent;

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
	let str = injectedVars.length ? `let ${injectedVars.map(v => v.name).join(',')}; // eslint-disable-line\n` : '';

	// include module script
	if (ast.module) {
		moduleUnoffsets = getOffsets(str);
		const { content } = ast.module;
		const { dedented, offsets } = dedentCode(text.slice(content.start, content.end));
		str += dedented;
		moduleOffsets = getOffsets(text.slice(0, content.start));
		moduleDedent = offsets;
	} else {
		moduleUnoffsets = null;
	}

	// include instance script
	if (ast.instance) {
		instanceUnoffsets = getOffsets(str);
		const { content } = ast.instance;
		const { dedented, offsets } = dedentCode(text.slice(content.start, content.end));
		str += dedented;
		instanceOffsets = getOffsets(text.slice(0, content.start));
		instanceDedent = offsets;
	} else {
		instanceUnoffsets = null;
	}

	// no-unused-vars: create references to all identifiers referred to by the template
	if (referencedVars.length) {
		str += `{${referencedVars.map(v => v.name).join(';')}} // eslint-disable-line\n`;
	}

	// prefer-const: create reassignments for all vars reassigned in component and for all exports
	if (reassignedVars.length) {
		str += `{${reassignedVars.map(v => v.name + '=0').join(';')}} // eslint-disable-line\n`;
	}

	// return processed string
	return [str];
};

// combine and transform linting messages
const postprocess = ([rawMessages]) => {
	// filter messages and fix their offsets
	if (rawMessages) {
		for (let i = 0; i < rawMessages.length; i++) {
			const message = rawMessages[i];
			if (message.ruleId !== 'no-self-assign' && (message.ruleId !== 'no-unused-labels' || !message.message.includes("'$:'"))) {
				if (instanceUnoffsets && message.line >= instanceUnoffsets.lines) {
					messages.push(shiftByOffsets(undedentCode(unshiftByOffsets(message, instanceUnoffsets), instanceDedent), instanceOffsets));
				} else if (moduleUnoffsets) {
					messages.push(shiftByOffsets(undedentCode(unshiftByOffsets(message, moduleUnoffsets), moduleDedent), moduleOffsets));
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
