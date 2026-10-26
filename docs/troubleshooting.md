---
title: Limitations and troubleshooting
description: What the editor does not do, and the problems and messages you can meet with it, with their cause and fix.
nav_title: Troubleshooting
order: 8
updated: 2026-10-26
---

## Limitations

- **Desk only.** The editor bundle is included on desk pages through `app_include_js`. Web forms and other website pages keep Frappe's Quill editor.
- **The comment box keeps Quill.** The **Comment** box in the form timeline is a separate control, `ControlComment`. Frappe defines it as a subclass of the Quill control when the desk loads, before this app's bundle replaces the Text Editor control, so it is not affected.
- **Colours do not show outside the editor.** Text colour, background colour, highlight and table cell colours are stored as references to the editor's palette (`var(--prose-color-<NAME>)`), which is defined only inside the editor. Read-only views, print formats and emails show that text without its colour. See [What the editor saves](saved-values.md#what-the-editor-saves).
- **Some Quill formatting is not carried over.** Text direction (right to left), font sizes and indentation that Quill stored as classes are dropped when a value is edited and saved again. See [Existing content and saved values](saved-values.md).
- **Four heading levels in the toolbar.** The toolbar offers Heading 1 to Heading 4. Headings of level 5 and 6 in existing values are kept.
- **Not included:** `@` mentions, emoji, slash commands, video, file attachments other than images, image galleries and iframe embeds. The editor's pop-ups for these are not styled for the desk, the desk's Text Editor never had several of them, and Frappe strips iframes from saved values anyway. Automatic typographic quotes and dashes are also off, so business text is stored as typed.
- **One image at a time.** Picking or dropping several images at once opens frappe-ui's image gallery, which the app turns off. Add images one by one.
- **Images are always public.** See [Images](images.md#where-the-file-goes).
- **No toolbar in child table rows.** Formatting there needs the row's own form.

## Troubleshooting

### The field still shows the Quill toolbar

The desk has not loaded the editor bundle.

1. Reload the page. The bundle replaces the control for fields built after it loads, so a form opened before the install keeps Quill until you reload.
2. Check that the bundle was built and registered: `sites/assets/assets.json` must have the keys `ui_text_editor.bundle.js` and `ui_text_editor.bundle.css`. If it has not, run `bench build --app ui_text_editor` from the bench directory, then reload.
3. Check that the app is installed on the site you are looking at: `bench --site <SITE_NAME> list-apps`.

If the field is in a web form, or is the comment box, it keeps Quill by design: see [Limitations](#limitations).

### An image does not upload

The image shows a message with **Try again**, **Choose another** and **Remove**. These are the messages Frappe returns most often, quoted as Frappe writes them:

| Message                                                         | Cause and fix                                                                                                                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "File size exceeded the maximum allowed size of `<N>` MB"       | The image is larger than the site allows. Use a smaller image, or have a System Manager raise **Max File Size (MB)** in System Settings.                                                 |
| "File type of `<EXTENSION>` is not allowed"                     | System Settings lists **Allowed File Extensions** and this one is not among them. Convert the image, or add the extension to the list.                                                   |
| "Only System Managers can make this file public."               | **Only allow System Managers to upload public files** is ticked in System Settings. The editor always uploads public files, so only System Managers can add images while that is ticked. |
| A permission error (its wording depends on what Frappe returns) | The document is saved and the image is being attached to it, which needs write permission on it. Ask for write access, or ask someone who has it to add the image.                       |
| "Could not upload the file."                                    | The editor's own message, shown when the request failed without a message from the server, for example when the connection dropped. Click **Try again**.                                 |

See [Image uploads](configuration.md#image-uploads) for the settings behind these.

### Coloured text loses its colour in a print format or an email

This is the colour limitation described above. Use bold or a heading for emphasis where the text is printed or emailed.

### A pop-up of the editor shows unstyled or behind a dialog

The link, colour and table-size pop-ups are moved inside the editor's style scope and above Frappe's dialogs. If one appears without styling, a new frappe-ui release has probably added a pop-up the app does not know yet. Report it on the [issue tracker](https://github.com/Avunu/ui_text_editor/issues); [How it works](development/architecture.md#the-scoped-stylesheet) explains the mechanism.

## Getting help

Report bugs and ask questions on the [GitHub issues](https://github.com/Avunu/ui_text_editor/issues) page.
