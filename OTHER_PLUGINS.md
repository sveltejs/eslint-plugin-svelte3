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

If you're using them on other linted files, consider [adding `overrides` for them for Svelte components](https://eslint.org/docs/user-guide/configuring#disabling-rules-only-for-a-group-of-files).

## Others?

If you've found another mainstream ESLint plugin that doesn't play nicely with this one, or has certain rules that don't work properly, please let us know!
