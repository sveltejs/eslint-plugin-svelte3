

	import type { Type, UnusedType } from './types';
	import Component from './Component.svelte';
	import UnusedComponent from './UnusedComponent.svelte';
	import { Thing1, Thing2, UnusedThing } from './things';
	const a: Type = new Thing1();
	a;
(
() => new Thing2()
);{Thing1,a}