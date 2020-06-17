<script>
	let foo = false;
	setInterval(() => {
		console.log(foo);
	}, 1000);
</script>

<div on:click={() => foo = true}>foo</div>
