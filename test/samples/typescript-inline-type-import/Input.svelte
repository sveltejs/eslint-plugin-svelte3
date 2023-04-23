<script lang='ts'>
	import Component from './Component.svelte';
	import UnusedComponent from './UnusedComponent.svelte';
	import { Thing1, Thing2, UnusedThing, type Type, type UnusedType } from './things';
	const a: Type = new Thing1();
	a;
</script>

<div on:click={() => new Thing2()} on:keyup={() => new Thing2()}></div>
<Component />
