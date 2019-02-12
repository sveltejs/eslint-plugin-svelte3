# eslint-plugin-svelte3

An ESLint plugin for Svelte v3 components.

## Features

- Svelte compiler errors and warnings are exposed as ESLint errors and warnings
- Variables referred to in your template won't be marked as unused in your scripts
- References to store auto-subscriptions are considered references to the underlying variables
- Messages about self-assignments are suppressed, as this is an official pattern for manually triggering reactive updates
- Messages about unused labels called `$` are suppressed, as this is the syntax for reactive assignments

## Installation

For now, this is not published to npm. You can still install it from Git tags. See the [`npm install` documentation](https://docs.npmjs.com/cli/install) for how to do this.

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
    - .some-extension
    - .some-other-extension
```

## Integration

It's probably a good idea to make sure you can lint from the command line before proceeding with configuring your editor.

### CLI

Using this with the command line `eslint` tool shouldn't require any special actions. Just remember that if you are running `eslint` on a directory, you need to pass it the `--ext` flag to tell it which nonstandard file extensions you want to lint.

Also make sure you do not have `eslint-plugin-html` enabled on the files you want linted as Svelte components, as the two plugins won't get along.

### Visual Studio Code

You'll need the [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) extension installed.

Unless you're using `.html` for your Svelte components, you'll need to configure `files.associations` to associate the appropriate file extension with the `html` language. For example, to associate `.svelte`, put this in your `settings.json`:

```json
{
  "files.associations": {
    "*.svelte": "html"
  }
}
```

Then, you'll need to tell the ESLint extension to also lint files with language `html` and to enable autofixing problems. If you haven't adjusted the `eslint.validate` setting, it defaults to `[ "javascript", "javascriptreact" ]`, so put this in your `settings.json`:

```json
{
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    {
      "language": "html",
      "autoFix": true
    }
  ]
}
```

Reload VS Code and give it a go!

### Atom

You'll need the [linter](https://atom.io/packages/linter) and [linter-eslint](https://atom.io/packages/linter-eslint) packages installed.

Unless you're using `.html` for your Svelte components, you'll need to configure `*`.`core`.`customFileTypes` to associate the appropriate file extension with the `test.html.basic` language. For example, to associate `.svelte`, put this in your `config.cson`:

```cson
"*":
  core:
    customFileTypes:
      "text.html.basic": [
        "svelte"
      ]
```

Then, you'll need to tell linter-eslint to also lint HTML files: add `source.html` to the list of scopes to run ESLint on in the linter-eslint settings.

Reload Atom and give it a go!

### Sublime Text

You'll need the [SublimeLinter](https://github.com/SublimeLinter/SublimeLinter) and [SublimeLinter-eslint](https://github.com/SublimeLinter/SublimeLinter-eslint) packages installed.

Unless you're using `.html` for your Svelte components, you'll need to configure Sublime to associate the appropriate file extension with the `text.html` syntax. Open any Svelte component, and go to **View > Syntax > Open all with current extension as... > HTML**.

Then, you'll need to tell SublimeLinter-eslint to lint entire files with the `text.html` syntax, and not just the contents of their `<script>` tags (which is the default). In your SublimeLinter configuration, you'll need to add `text.html` to `linters`.`eslint`.`selector`. If you're starting with the default values, this would mean:

```json
{
  "linters": {
    "eslint": {
      "selector": "source.js - meta.attribute-with-value, text.html"
    }
  }
}
```

Reload Sublime and give it a go!

### Other integrations

If you've gotten this plugin to work with other editors, please let us know!

## License

[MIT](LICENSE)
