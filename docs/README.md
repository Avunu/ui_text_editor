---
title: Rich Text Editor for Desk
description: Replaces the Quill editor behind every Text Editor field in the Frappe desk with the frappe-ui rich text editor.
nav_title: Overview
order: 0
updated: 2026-10-26
---

Frappe's newer apps use the rich text editor from [frappe-ui](https://github.com/frappe/frappe-ui), built on TipTap, while the desk still edits long text in Quill. Rich Text Editor for Desk replaces the Quill editor behind every **Text Editor** field in the desk with the frappe-ui editor, so notes, descriptions and email bodies are written in the same editor as Frappe's newer apps, with a selection menu, merged and coloured table cells, and image uploads that show their progress.

It is for anyone who writes in the Frappe desk and for the administrators who run it. Nothing about your doctypes changes, and values that Quill saved open as they were. It runs on Frappe v16 and is free software under the [MIT licence](../license.txt).

## What you get

### A toolbar and a selection menu

Every Text Editor field gets a toolbar with headings, bold, italic, underline, strike, inline code, text and background colour, highlight, bullet, numbered and check lists, indent, alignment, quote, code block, horizontal rule, links, images, tables, undo and redo. Selecting text shows a small menu for the most common formats. See [Write and format text](editing.md).

![A Note's content field in the frappe-ui editor, with its toolbar, headings, check list, bullet list and table](screenshots/note-editor-light.webp)

### Tables

Insert a table of the size you pick, then add and remove rows and columns, merge cells and colour them from the controls that appear while the cursor is in the table. See [Tables](tables.md).

![The row and column controls shown while the cursor is in a table](screenshots/table-menu-light.webp)

### Image upload

Paste, drop or pick an image and it is uploaded to the site as a public file, so it also loads in emails and on web pages. In a saved document the file is attached to that document. See [Images](images.md).

### Values that stay compatible with Quill

The editor reads the values Quill saved and saves new ones the way Quill did, so print formats, emails and read-only views keep working. See [Existing content and saved values](saved-values.md).

## Where to start

| You are                              | Read                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Someone writing in the desk          | [Write and format text](editing.md), then [Tables](tables.md) and [Images](images.md)                                         |
| The administrator installing the app | [Install and upgrade](install.md), [Configuration](configuration.md) and [Existing content and saved values](saved-values.md) |
| Someone whose editor misbehaves      | [Limitations and troubleshooting](troubleshooting.md)                                                                         |
| A developer changing the app         | [Development](development/README.md) and [How it works](development/architecture.md)                                          |

## Requirements

- A bench with Frappe v16. The app declares `frappe >=16.0.0,<17.0.0`.
- No other app. The app has no doctypes of its own and needs neither ERPNext nor any other app, so you can install it at any point.
- Node and yarn on the machine that builds the app. `bench build` runs the app's `yarn build`, which builds the editor bundle with Vite.

> [!NOTE]
> Where a page describes Frappe's own behaviour (uploads, file limits, the comment box), it was checked against Frappe 16.52 and frappe-ui 1.0.2.

## Source and changes

The source is at [github.com/Avunu/ui_text_editor](https://github.com/Avunu/ui_text_editor). Releases and their notes are on the [releases page](https://github.com/Avunu/ui_text_editor/releases); release-please also writes them to `CHANGELOG.md` in the repository from the first release on.
