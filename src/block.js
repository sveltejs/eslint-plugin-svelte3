import { get_offsets, dedent_code } from './utils.js';

// find the index of the last element of an array matching a condition
export const find_last_index = (array, cond) => {
	const idx = array.findIndex(item => !cond(item));
	return idx === -1 ? array.length - 1 : idx - 1;
};

// find the last element of an array matching a condition
export const find_last = (array, cond) => array[find_last_index(array, cond)];

// return a new block
export const new_block = () => ({ transformed_code: '', line_offsets: null, translations: new Map() });

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
