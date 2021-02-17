<script lang='ts'>
	import type { Type, UnusedType } from './types';
	import Component from './Component.svelte';
	import UnusedComponent from './UnusedComponent.svelte';
	import { Thing1, Thing2, UnusedThing } from './things';
	const a: Type = new Thing1();
	a;
</script>

<div on:click={() => new Thing2()}></div>
<Component />
