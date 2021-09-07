<script lang="ts">
	import { f, g } from './store';
	for (const a in []) {
		a;
	}

	function foo() {
		return 1 as any;
	}

	foo().hello();
	$f();
</script>

{$g().slice(2)}
