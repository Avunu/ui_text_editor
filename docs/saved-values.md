---
title: Existing content and saved values
description: How the editor opens values that Quill saved, what it converts and what it drops, and the HTML it stores.
nav_title: Saved values
order: 6
updated: 2026-10-26
---

A Text Editor field stores HTML. The rest of Frappe, from print formats to emails and read-only views, relies on the way Quill writes that HTML, so the editor reads Quill's values and writes its own in the same shape. You do not need to migrate anything when you install the app.

## Opening a value Quill saved

When a field opens, the editor takes the stored value, removes Quill's wrapper and rewrites the markup that only Quill understands:

| Quill stored                                                              | The editor shows                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------ |
| An `ol` whose items have `data-list="bullet"`                             | A bulleted list                                  |
| An `ol` whose items have `data-list="checked"` or `data-list="unchecked"` | A check list, with the boxes ticked as they were |
| An `ol` whose items have `data-list="ordered"`, or none                   | A numbered list                                  |
| The classes `ql-align-center`, `ql-align-right` and `ql-align-justify`    | The same alignment                               |
| Quill's list markers and cursor (`ql-ui`, `ql-cursor`)                    | Nothing: they are dropped                        |

Headings, bold, italic, links, quotes, code blocks, tables and images are standard HTML and open as they are. Text and background colours that Quill wrote as inline styles are matched to the nearest colour of the editor's palette.

Some of what Quill could store has no counterpart in the editor and is not carried over when you edit and save the value again: text direction (right to left), font sizes, and indentation that Quill stored as classes. Until someone edits the field, the stored value is not touched.

## What the editor saves

- The value is wrapped in `<div class="ql-editor read-mode">`, as Quill wraps it. The desk, print formats and emails style rich text through that class.
- An empty editor saves an empty string, not an empty paragraph, so a mandatory Text Editor field left empty is reported as missing and "is set" filters work as they did.
- Scripts and style blocks are removed before the value is stored, as with Quill.
- Lists, check lists, tables and the other content are saved in the frappe-ui editor's own HTML. A check list, for example, is stored as `ul data-type="taskList"`.
- Text colour, background colour, highlight and table cell colours are saved as references to the editor's palette, such as `color: var(--prose-color-red)`, not as colour values.

> [!WARNING]
> The palette's colours are defined only inside the editor. Outside it, in the form's read-only view, in print formats and in emails, text and cells coloured with the editor show without their colour. This also applies to colours that Quill saved, once the value is edited and saved in the new editor.

The value is written to the document 300 milliseconds after you stop typing, or when you leave the field. Opening a field and clicking into it does not change the stored value or mark the form as changed.

## If you remove the app

Values saved while the app was installed keep the Quill wrapper, so they still render. They are not converted back to Quill's own list markup, so editing them in Quill again may show some content, such as check lists, differently. See [Uninstall](install.md#uninstall).
