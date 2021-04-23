<script>
	import { imported, createStore } from './store.js';

	const writeOnly = createStore();
	$writeOnly = 99;

	const readOnly = createStore();
	$readOnly;

	$imported = 'some value';
</script>
<div on:click={() => $imported = 'clicked' }/>
