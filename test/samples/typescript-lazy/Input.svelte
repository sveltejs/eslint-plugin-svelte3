<script context="module">
	export const z = '';
	$: z2 = z;
</script>

<script lang="ts">
	export let a: any;

	export let b: any
	export let d: number;

	const asd = d.asd();

	interface A {}

	function c(x) {}
	c(1);

	$: z1 = z;
</script>

<o>{b}</o>
<p>{x}</p>
