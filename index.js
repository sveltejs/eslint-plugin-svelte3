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

// adjust position references in a message according to the previous dedenting
const undedentCode = (message, { offsets, totalOffsets }) => {
	message.column += offsets[message.line - 1];
	if (message.endColumn) {
		message.endColumn += offsets[message.endLine - 1];
	}
	if (message.fix) {
		message.fix.range[0] += totalOffsets[message.line];
		message.fix.range[1] += totalOffsets[message.line];
	}
	return message;
};

/// PRE- AND POSTPROCESSING FUNCTIONS FOR SVELTE COMPONENTS ///

const { compile } = require('svelte/compiler');

// extract scripts to lint from component definition
const preprocess = (data, text) => {
	// get information about the component
	let info;
	try {
		// get ASTs and stats for the component
		info = compile(text, { dev: true, generate: false, onwarn: () => {} });
	} catch ({ name, message, start }) {
		// convert the error to an eslint message, store it, and return
		data.messages = [
			{
				ruleId: name,
				severity: 2,
				message,
				line: start && start.line,
				column: start && start.column + 1,
			},
		];
		return [];
	}
	const { ast: { module: moduleJs, instance: instanceJs }, stats: { vars, warnings } } = info;
	const injectedVars = vars.filter(v => v.injected);
	const referencedVars = vars.filter(v => v.referenced);

	// convert warnings to eslint messages
	data.messages = warnings.map(({ code, message, start, end }) => ({
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
	let str = injectedVars.length ? `let ${injectedVars.map(v => v.name).join(',')}; // eslint-disable-line\n` : '';
	data.moduleUnoffsets = getOffsets(str);

	// include module script
	if (moduleJs) {
		const { dedented, offsets } = dedentCode(text.slice(moduleJs.content.start, moduleJs.content.end));
		str += dedented;
		data.moduleOffsets = getOffsets(text.slice(0, moduleJs.content.start));
		data.moduleDedent = offsets;
	}

	// include instance script
	if (instanceJs) {
		str += '\n';
		data.instanceUnoffsets = getOffsets(str);
		const { dedented, offsets } = dedentCode(text.slice(instanceJs.content.start, instanceJs.content.end));
		str += dedented;
		data.instanceOffsets = getOffsets(text.slice(0, instanceJs.content.start));
		data.instanceDedent = offsets;
	}

	// create references to all identifiers referred to by the template
	if (referencedVars.length) {
		str += `\n{${referencedVars.map(v => v.reassigned ? v.name + '=0;' + v.name : v.name).join(';')}} // eslint-disable-line`;
	}

	// return processed string
	return [str];
};

// combine and transform linting messages
const postprocess = ({ messages, moduleUnoffsets, moduleOffsets, instanceUnoffsets, instanceOffsets, moduleDedent, instanceDedent }, [rawMessages]) => {
	// filter messages and fix their offsets
	if (rawMessages) {
		for (let i = 0; i < rawMessages.length; i++) {
			const message = rawMessages[i];
			if (message.ruleId !== 'no-self-assign' && (message.ruleId !== 'no-unused-labels' || !message.message.includes("'$:'"))) {
				if (instanceUnoffsets && message.line >= instanceUnoffsets.lines) {
					messages.push(shiftByOffsets(undedentCode(unshiftByOffsets(message, instanceUnoffsets), instanceDedent), instanceOffsets));
				} else if (moduleOffsets) {
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

// patch Linter#verify
const { verify } = Linter.prototype;
Linter.prototype.verify = function(code, config, options) {
	if (typeof options === 'string') {
		options = { filename: options };
	}
	if (options && options.filename) {
		// get 'svelte3/extensions' settings value
		const extensions = config && config.settings && config.settings['svelte3/extensions'] || ['.svelte'];
		if (!Array.isArray(extensions)) {
			throw new Error('Setting svelte3/extensions is not an array');
		}

		if (extensions.some(extension => options.filename.endsWith(extension))) {
			// lint this Svelte file
			const data = {};
			options = Object.assign({}, options, { preprocess: preprocess.bind(null, data), postprocess: postprocess.bind(null, data) });
		}
	}

	// call original Linter#verify
	return verify.call(this, code, config, options);
};
