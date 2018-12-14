# eslint-plugin-svelte3

An ESLint plugin for Svelte v3 components.

## Features

- Svelte compiler errors and warnings are exposed as ESLint messages
- Variables referred to in your template won't be marked as unused in your scripts
- Messages about self-assignments are suppressed, as this is an official pattern for manually triggering reactive updates
- Messages about unused labels called `$` are suppressed, as this is the syntax for reactive assignments

## Installation

This is not published to npm. Install from Git tags. See [the documentation on `npm install`](https://docs.npmjs.com/cli/install) for how to do this.

This plugin needs to be able to `require('svelte/compiler')`. It requires Svelte 3.0.0-alpha2 or later.

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

[MIT](LICENSE)
