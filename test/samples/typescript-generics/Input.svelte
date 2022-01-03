<script lang='ts'>
	type T = $$Generic;
	type U = $$Generic<string>;
	export let items: T[];
	export let message: U;
</script>

{#each items as item}
	<slot {item} />
{/each}

{#if message}
	{message}
{/if}
