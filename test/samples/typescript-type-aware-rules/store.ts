import { readable, writable } from 'svelte/store';

export const f = readable(async () => "hello");
export const g = writable(() => "world");
