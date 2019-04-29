# Visual Studio Code

You'll need the [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) extension installed.

Unless you're using `.html` for your Svelte components, you'll need to configure `files.associations` to associate the appropriate file extension with the `html` language. For example, to associate `.svelte`, put this in your `settings.json`:

```json
{
  "files.associations": {
    "*.svelte": "html"
  }
}
```

Then, you'll need to tell the ESLint extension to also lint files with language `html` and to enable autofixing where possible. If you haven't adjusted the `eslint.validate` setting, it defaults to `[ "javascript", "javascriptreact" ]`, so put this in your `settings.json`:

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

# Atom

You'll need the [linter](https://atom.io/packages/linter) and [linter-eslint](https://atom.io/packages/linter-eslint) packages installed.

Unless you're using `.html` for your Svelte components, you'll need to configure `*`.`core`.`customFileTypes` to associate the appropriate file extension with the `text.html.basic` language. For example, to associate `.svelte`, put this in your `config.cson`:

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

# Sublime Text

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

# Vim

You'll need the [ALE (Asynchronous Lint Engine)](https://github.com/w0rp/ale) plugin installed.

Unless you're using `.html` for your Svelte components, you'll need to configure Vim to associate the appropriate file extension with the `html` syntax. For example, to associate `.svelte`, put this in your `.vimrc`:

```vim
au BufNewFile,BufRead,BufReadPost *.svelte set syntax=html
```

Then you'll need to tell ALE to lint and fix `.svelte` files using ESLint, so put this in your `.vimrc`:

```vim
let g:ale_linter_aliases = {
\   'svelte': ['javascript']
\}
let g:ale_linters = {
\   'svelte': ['eslint']
\}
let g:ale_fixers = {
\   'svelte': ['eslint']
\}
```

Reload Vim and give it a go!

# Other integrations?

If you've gotten this plugin to work with other editors, please let us know!
