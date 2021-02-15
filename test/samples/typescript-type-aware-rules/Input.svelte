<script lang="ts">
	for (const a in []) {
		a;
	}

	function foo() {
		return 1 as any;
	}

	foo().hello();
</script>
