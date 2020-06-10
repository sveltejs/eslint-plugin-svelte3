export let state;
export const reset = () => {
	state = {
		messages: null,
		var_names: null,
		blocks: new Map(),
		pre_line_offsets: null,
		post_line_offsets: null,
		mappings: null,
	};
};
reset();
