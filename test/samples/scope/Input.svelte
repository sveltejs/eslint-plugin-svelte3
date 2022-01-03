<script>
	let foo;
</script>

{#each foo as bar}
	{bar}
{/each}

{bar}

{#each foo as [bar1, { bar2 }]}
	{bar1}
	{bar2}
	{bar3}
{/each}

<Component let:baz>
	{baz}
</Component>

<Component let:baz={{ baz1, baz2 }}>
	{baz1}
	{baz2}
	{baz3}
</Component>

<Component2>
	<div slot='foo' let:blah={blah2}>
		{blah1}
		{blah2}
	</div>
</Component2>

<Component2>
	<svelte:fragment slot='foo' let:blah={blah2}>
		{blah1}
		{blah2}
	</svelte:fragment>
</Component2>

{#await foo}
	xxx
{:then blah1}
	{blah1}
	{blah2}
{:catch blah2}
	{blah1}
	{blah2}
{/await}

{#await foo then bar}
	{bar}
{/await}
