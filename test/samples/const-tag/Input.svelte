<script>
	export let boxes;
	let p;
</script>

{#each boxes as box}
	{@const area = box.width * box.height}
	{box.width} * {box.height} = {area}
{/each}

{area} <!-- undef -->

{#await p}
	wait
{:then}
	{@const box = boxes[0]}
	{box.width}
{/await}

{#await p then}
	then
{:catch}
	{@const box = boxes[0]}
	{box.width}
{/await}

<Component>
	{@const box = boxes[0]}
	{box.width}
</Component>

<Component>
	<svelte:fragment slot="foo">
		{@const box = boxes[0]}
		{box.width}
	</svelte:fragment>
</Component>
