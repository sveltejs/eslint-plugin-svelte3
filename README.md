# eslint-plugin-svelte3

ESLint plugin for linting Svelte v3 components.

## Installation

For now, either install from this Git repo, or clone somewhere and symlink.

This plugin needs to be able to `require('svelte/compiler')`.

## Usage

Just specify it in your `.eslintrc`.

```yaml
plugins:
  - svelte3
```

## Configuration

By default, all `.svelte` files will be linted. You can set the `svelte3/extensions` setting in your `.eslintrc` to an array of file extensions to override this.

```yaml
settings:
  svelte3/extensions:
    - .html
```

## License

Copyright (c) 2018 Conduitry

- [MIT](LICENSE)
