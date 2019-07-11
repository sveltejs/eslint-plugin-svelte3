<script context='module'>
	const foo = {}, bar = {};
	let baz1 = null, baz2 = null;
</script>

<script>
	console.log(foo, $foo);
	console.log(baz1, baz2);
	console.log($blah);
	baz2 = 0;
</script>
