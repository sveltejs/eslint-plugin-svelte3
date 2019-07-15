// return a new block
export const new_block = () => ({ transformed_code: '', line_offsets: null, translations: new Map() });

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

// get translation info and include the processed scripts in this block's transformed_code
export const get_translation = (text, block, node, options = {}) => {
	block.transformed_code += '\n';
	const translation = { options, unoffsets: get_offsets(block.transformed_code) };
	translation.range = [node.start, node.end];
	const { dedented, offsets } = dedent_code(text.slice(node.start, node.end));
	block.transformed_code += dedented;
	translation.offsets = get_offsets(text.slice(0, node.start));
	translation.dedent = offsets;
	translation.end = get_offsets(block.transformed_code).lines;
	for (let i = translation.unoffsets.lines; i <= translation.end; i++) {
		block.translations.set(i, translation);
	}
	block.transformed_code += '\n';
};
