# v0.4.7

- Fix regression with specifying an array of warnings to ignore

# v0.4.6

- Add `svelte3/compiler-options` setting to control how the compiler is called during linting

# v0.4.5

- Proper fix for not wiping tag names that begin with `<style`

# v0.4.4

- With `svelte3/ignore-warnings`, don't wipe elements whose tag names merely begin with `<style`
- The plugin is now published to npm

# v0.4.3

- Better handling for files linted in Windows/CRLF `linebreak-style`

# v0.4.2

- Work around issues caused by ESLint issues with fixes that replace more of the file than necessary

# v0.4.1

- Make sure fixes for issues at the beginning and end of the scripts do not change text outside of the scripts

# v0.4.0

- Reworked configuration to be more flexible:
  - `svelte3/ignore` has been renamed to `svelte3/ignore-warnings`
  - `svelte3/extensions` has been removed and `svelte3/enabled` has been added (which works differently but is more powerful)
- `svelte3/ignore-styles` has been added as an immediate solution for components with styles written in something other than normal CSS

# v0.3.0

- Support and require at least beta 4

# v0.2.3

- Add `svelte3/ignore` setting for ignoring specific compiler warnings

# v0.2.2

- Include the position of the end of a compiler error message, when available

# v0.2.1

- Don't warn about `export let`s with default values and no other reassignments when using `prefer-const`

# v0.2.0

- Add handling of store auto-subscriptions and other injected variables
- Require alpha 21

# v0.1.0

- Initial release
