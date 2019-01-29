# eslint-plugin-svelte3

An ESLint plugin for Svelte v3 components.

## Features

- Svelte compiler errors and warnings are exposed as ESLint messages
- Variables referred to in your template won't be marked as unused in your scripts
- References to store auto-subscriptions are considered references to the underlying variables
- Messages about self-assignments are suppressed, as this is an official pattern for manually triggering reactive updates
- Messages about unused labels called `$` are suppressed, as this is the syntax for reactive assignments

## Installation

For now, this is not published to npm. Install from Git tags. See [the documentation on `npm install`](https://docs.npmjs.com/cli/install) for how to do this.

Untagged releases may depend on unreleased Svelte 3 features. Tagged releases should always work with the specified Svelte version. The latest tagged version requires at least Svelte 3.0.0-alpha21.

## Usage

Just specify it in your `.eslintrc`.

```yaml
plugins:
  - svelte3
```

This plugin needs to be able to `require('svelte/compiler')`. If ESLint, this plugin, and Svelte are all installed locally in your project, this should not be a problem.

## Configuration

By default, all `.svelte` files will be linted. You can set the `svelte3/extensions` setting in your `.eslintrc` to an array of file extensions to override this.

```yaml
settings:
  svelte3/extensions:
    - .html
```

## Integration

It's probably a good idea to make sure you can lint from the command line before proceeding with configuring your editor.

### CLI

Using this with the command line `eslint` tool shouldn't require any special actions. Remember that you need to tell `eslint` which nonstandard file extensions you want to lint if you are passing it a directory.

If you are linting a Sapper project, you'll need to change the `svelte3/extensions` configuration value to `['.html']`. Also make sure you do not have `eslint-plugin-html` enabled on the files you want linted as Svelte components, as the two plugins won't get along.

### Visual Studio Code

You'll need the [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) extension installed.

If you're using a different extension than `.html` for your Svelte components, you'll need to configure `files.associations` to associate it with the `html` language.

Then, you'll need to tell the ESLint extension to also lint files with language `html` and to enable automatically fixable problems. The default languages it lints are `javascript` and `javascriptreact`, so put this in your `settings.json`:

```
	"eslint.validate": [
		"javascript",
		"javascriptreact",
		{
			"language": "html",
			"autoFix": true,
		},
	],
```

Cross your fingers and give it a go!

### Other integrations

If you've gotten this plugin to work with other editors, let me know how you did it!

## License

[MIT](LICENSE)
