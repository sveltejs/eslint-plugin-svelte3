import { get_offsets, dedent_code } from './utils.js';

// create a new block to add code transformations to
export const new_block = () => ({ transformed_code: '', line_offsets: null, translations: new Map() });

// get translation info and include the processed scripts in this block's transformed_code
// each translation consists of info about the original text range (range),
// the difference after dedenting (dedent), line/length info about the text itself (offsets),
// line/length info about the transformed code prior to adding the text (unoffsets) and the new
// line count of the transformed code after adding the text (end). This information can be used
// to map code back to its original position.
export const get_translation = (text, block, node, options = {}) => {
	block.transformed_code += '\n';
	const translation = { options, unoffsets: get_offsets(block.transformed_code) };
	translation.range = [node.start, node.end];
	const { dedented, offsets, indentation } = dedent_code(text.slice(node.start, node.end));
	block.transformed_code += dedented;
	translation.offsets = get_offsets(text.slice(0, node.start));
	translation.dedent = offsets;
	translation.indentation = indentation;
	translation.end = get_offsets(block.transformed_code).lines;
	for (let i = translation.unoffsets.lines; i <= translation.end; i++) {
		block.translations.set(i, translation);
	}
	block.transformed_code += '\n';
};
