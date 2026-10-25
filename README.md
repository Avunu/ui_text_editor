<!-- Copyright (c) 2026, Avunu LLC and contributors
For license information, please see license.txt-->

<!-- frappe-nix:begin header -->

<div align="center">

<img src="ui_text_editor/public/images/ui_text_editor-logo.svg" width="80" alt="">

# Rich Text Editor for Desk

Rich text editor from frappe-ui for every Text Editor field in the Frappe desk

[![CI](https://github.com/Avunu/ui_text_editor/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/Avunu/ui_text_editor/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Avunu/ui_text_editor)](https://github.com/Avunu/ui_text_editor/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](license.txt)
[![Frappe v16](https://img.shields.io/badge/Frappe-v16-blue)](https://github.com/frappe/frappe/tree/version-16)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/note-editor-dark.webp">
  <img src="docs/screenshots/note-editor-light.webp" alt="A Note's content field in the frappe-ui editor, with its toolbar, headings, check list, bullet list and table">
</picture>

</div>

<!-- frappe-nix:end header -->

## Overview

Frappe's newer apps use the rich text editor from [frappe-ui](https://github.com/frappe/frappe-ui), built on TipTap, while the desk still edits long text in Quill. This app replaces the Quill editor behind every **Text Editor** field in the desk with the frappe-ui editor, so notes, descriptions and e-mail bodies get tables, check lists and a cleaner toolbar.

It is a drop-in swap for anyone running the Frappe desk: no DocType changes are needed, and values already saved by the Quill editor open as they were.

## Features

- A toolbar with headings, bold, italic, underline, strike, inline code, text and highlight colour, bullet, numbered and check lists, indent, alignment, quote, code block, horizontal rule, links, images, tables, undo and redo.
- Selecting text shows a small formatting menu; being inside a table shows row and column controls.
- Image upload: paste, drop or use the toolbar. Images are uploaded to Frappe's `upload_file` as public files, so they also load in e-mails and web pages. In a saved document they are attached to it; in a new one they are uploaded without an attachment.
- Values are saved the way Quill saved them, so print formats, e-mails and read-only views keep working.
- Light and dark theme, following the desk.
- A compact editor without the toolbar in grid rows, and `max_height` support.

<!-- frappe-nix:begin compatibility -->

## Compatibility

| Frappe | Branch       |
| ------ | ------------ |
| v16    | `version-16` |

<!-- frappe-nix:end compatibility -->

<!-- frappe-nix:begin installation -->

## Installation

```bash
bench get-app https://github.com/Avunu/ui_text_editor --branch version-16
bench --site <site> install-app ui_text_editor
```

<!-- frappe-nix:end installation -->

Until the first release creates the `version-16` branch, install from `develop` instead: `bench get-app https://github.com/Avunu/ui_text_editor --branch develop`.

`bench get-app` builds the app's assets. If you install from a checkout without building, run `bench build --app ui_text_editor` before reloading the desk.

## Configuration

There is nothing to configure. Once the app is installed and its assets are built, every **Text Editor** field in the desk uses the new editor. A field's **Placeholder**, **Read Only** and **Max Height** properties work as they do with Quill.

## How It Works

- The desk bundle (`app_include_js`) replaces `frappe.ui.form.ControlTextEditor` with a control that mounts the frappe-ui editor. Fields built after the bundle loads use it.
- The control converts between the stored value and the editor's HTML. It saves the value wrapped in `<div class="ql-editor read-mode">`, as Quill does, and an empty editor saves an empty string. When a value is opened, Quill's bullet lists, check lists and alignment classes are converted to the editor's markup.
- Edits are written to the document 300 ms after typing stops, or on blur, the same delay Quill's control uses. Scripts and styles are stripped from the value, as with Quill.
- The editor's stylesheet is scoped to the editor, so frappe-ui's Tailwind reset and class names cannot change the rest of the desk. The [development notes](docs/development.md) explain how.

## Limitations

- Text direction (RTL), font sizes and nested indentation that Quill stored as classes are not carried over when a value is opened.
- **Not included:** `@` mentions, emoji, slash commands, video, file attachments and iframe embeds. The editor's pop-ups for those are not styled for the desk, and the server strips iframes anyway.
- The **Comment** box in the form timeline is a separate control and still uses Quill.

<!-- frappe-nix:begin support -->

## Support

- Bug reports and questions: [GitHub issues](https://github.com/Avunu/ui_text_editor/issues)
- E-mail: <mail@avu.nu>

<!-- frappe-nix:end support -->

<!-- frappe-nix:begin development -->

## Development

```bash
nix develop        # or: direnv allow
prek install       # the git hooks CI runs
frappe-test        # the tests, the way CI runs them
```

The managed files, checks and release flow are described in the [app standards documentation](https://docs.avunu.net/frappe-nix/docs/app-standards/).

<!-- frappe-nix:end development -->

The build commands, the source layout and the CSS scoping are described in [docs/development.md](docs/development.md).

<!-- frappe-nix:begin license -->

## License

MIT, Copyright (c) 2024–present Avunu LLC → [license.txt](license.txt)

<!-- frappe-nix:end license -->
