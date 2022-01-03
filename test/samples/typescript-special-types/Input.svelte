<script lang='ts'>
	type T = $$Generic;
	type U = $$Generic<string>;

	interfacce $$Slots {
		default: {
			foo: string;
		}
	}

	type $$Props = {
		items: T;
		message: U;
	}

	interface $$Events {
		click: string;
	}

	export let items: T[];
	export let message: U;
</script>

{#each items as item}
	<slot {item} />
{/each}

{#if message}
	{message}
{/if}
