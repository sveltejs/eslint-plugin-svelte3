export let state;
export const reset = () => {
	state = {
		messages: null,
		var_names: null,
		blocks: new Map(),
	};
};
reset();
