import { position_at } from './mapping.js';
import { state, reset } from './state.js';
import { get_line_offsets } from './utils.js';

// transform a linting message according to the module/instance script info we've gathered
const transform_message = ({ transformed_code }, { unoffsets, dedent, indentation, offsets, range }, message) => {
	let fix_pos_start;
	let fix_pos_end;
	if (message.fix) {
		// strip out the start and end of the fix if they are not actually changes
		while (message.fix.range[0] < message.fix.range[1] && transformed_code[message.fix.range[0]] === message.fix.text[0]) {
			message.fix.range[0]++;
			message.fix.text = message.fix.text.slice(1);
		}
		while (message.fix.range[0] < message.fix.range[1] && transformed_code[message.fix.range[1] - 1] === message.fix.text[message.fix.text.length - 1]) {
			message.fix.range[1]--;
			message.fix.text = message.fix.text.slice(0, -1);
		}
		// If the fix spans multiple lines, add the indentation to each one
		message.fix.text = message.fix.text.split('\n').join(`\n${indentation}`);
		// The fix can span multiple lines and doesn't need to be on the same line
		// as the lint message, so we can't just add total_offsets at message.line to it
		// (see dedent-step below)
		fix_pos_start = position_at(message.fix.range[0], transformed_code);
		fix_pos_end = position_at(message.fix.range[1], transformed_code);
	}

	// shift position reference backward according to unoffsets
	// (aka: throw out the generated code lines prior to the original code)
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
	// (aka: re-add the stripped indentation)
	{
		const { offsets, total_offsets } = dedent;
		message.column += offsets[message.line - 1];
		if (message.endColumn) {
			message.endColumn += offsets[message.endLine - 1];
		}
		if (message.fix) {
			// We need the offset at the line relative to dedent's total_offsets. The dedents
			// start at the point in the total transformed code where a subset of the code was transformed.
			// Therefore substract (unoffsets.lines + 1) which marks the start of that transformation.
			// Add +1 afterwards because total_offsets are 1-index-based.
			message.fix.range[0] += total_offsets[fix_pos_start.line - unoffsets.lines + 2];
			message.fix.range[1] += total_offsets[fix_pos_end.line - unoffsets.lines + 2];
		}
	}

	// shift position reference forward according to offsets
	// (aka: re-add the code that is originally prior to the code)
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
		case '@typescript-eslint/indent':
		case 'indent': return !translation.options.template;
		case 'linebreak-style': return message.line !== translation.end;
		case 'no-labels': return get_identifier(get_referenced_string(block, message)) !== '$';
		case 'no-restricted-syntax': return message.nodeType !== 'LabeledStatement' || get_identifier(get_referenced_string(block, message)) !== '$';
		case 'no-self-assign': return !state.var_names.has(get_identifier(get_referenced_string(block, message)));
		case 'no-undef': return get_referenced_string(block, message) !== '$$Generic';
		case 'no-unused-labels': return get_referenced_string(block, message) !== '$';
		case '@typescript-eslint/no-unused-vars':
		case 'no-unused-vars': return !['$$Props', '$$Slots', '$$Events'].includes(get_referenced_string(block, message));
		case '@typescript-eslint/quotes':
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
