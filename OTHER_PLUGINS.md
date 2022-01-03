# Interactions with other plugins

## `eslint-plugin-html`

Don't enable this at all on the files you're running `eslint-plugin-svelte3` on. Everything will almost certainly break.

## `eslint-plugin-prettier`

Don't enable this either on Svelte components. If you want to use Prettier, just use it directly, along with appropriate plugins.

## `eslint-plugin-import`

These rules are known to not work correctly together with this plugin:

- `import/first`
- `import/no-duplicates`
- `import/no-mutable-exports`
- `import/no-unresolved` when using `svelte3/named-blocks`, pending [this issue](https://github.com/benmosher/eslint-plugin-import/issues/1415)

If you're using them on other linted files, consider [adding `overrides` for them for Svelte components](https://eslint.org/docs/user-guide/configuring/configuration-files#how-do-overrides-work).

## `eslint-config-standard`

This uses `eslint-plugin-import` by default, so the above applies.

## Others?

If you've found another mainstream ESLint plugin that doesn't play nicely with this one, or has certain rules that don't work properly, please let us know!
