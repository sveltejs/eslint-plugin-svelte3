import { state, reset } from './state.js';
import { get_line_offsets } from './utils.js';

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

// extract the string referenced by a message
const get_referenced_string = (block, message) => {
	if (message.line && message.column && message.endLine && message.endColumn) {
		if (!block.line_offsets) {
			block.line_offsets = get_line_offsets(block.transformed_code);
		}
		return block.transformed_code.slice(block.line_offsets[message.line - 1] + message.column, block.line_offsets[message.endLine - 1] + message.endColumn);
	}
};

// extract something that looks like an identifier (not supporting unicode escape stuff) from the beginning of a string
const get_identifier = str => (str && str.match(/^[^\s!"#%&\\'()*+,\-./:;<=>?@[\\\]^`{|}~]+/) || [])[0];

// determine whether this message from ESLint is something we care about
const is_valid_message = (block, message, translation) => {
	switch (message.ruleId) {
		case 'eol-last': return false;
		case 'indent': return !translation.options.template;
		case 'linebreak-style': return message.line !== translation.end;
		case 'no-labels': return get_identifier(get_referenced_string(block, message)) !== '$';
		case 'no-restricted-syntax': return message.nodeType !== 'LabeledStatement' || get_identifier(get_referenced_string(block, message)) !== '$';
		case 'no-self-assign': return !state.var_names.has(get_identifier(get_referenced_string(block, message)));
		case 'no-unused-labels': return get_referenced_string(block, message) !== '$';
		case 'quotes': return !translation.options.in_quoted_attribute;
	}
	return true;
};

// transform linting messages and combine with compiler warnings
export const postprocess = blocks_messages => {
	// filter messages and fix their offsets
	const blocks_array = [...state.blocks.values()];
	for (let i = 0; i < blocks_messages.length; i++) {
		const block = blocks_array[i];
		for (let j = 0; j < blocks_messages[i].length; j++) {
			const message = blocks_messages[i][j];
			const translation = block.translations.get(message.line);
			if (translation && is_valid_message(block, message, translation)) {
				transform_message(block, translation, message);
				state.messages.push(message);
			}
		}
	}

	// sort messages and return
	const sorted_messages = state.messages.sort((a, b) => a.line - b.line || a.column - b.column);
	reset();
	return sorted_messages;
};
