---
title: Configuration
description: The field properties the editor follows, the Frappe settings that govern image uploads, and everything the app adds to a site.
nav_title: Configuration
order: 2
updated: 2026-10-26
---

Rich Text Editor for Desk has no settings page, no site configuration keys and no roles of its own. Once it is installed and its bundle is built, every **Text Editor** field in the desk uses the new editor. What you can shape is the field itself, through the properties Frappe already has, and the upload rules Frappe applies to images.

## Field properties

The editor reads these properties of a Text Editor field. Set them in the DocType's fields table, or for a standard doctype in **Customize Form** where Frappe offers them there.

| Property        | What the editor does with it                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Placeholder** | Shown in the empty editor, translated as Frappe translates other labels.                                                                                                                     |
| **Read Only**   | The editor cannot be edited and shows neither the toolbar nor the selection and table menus. A field also stops being editable when Frappe disables it, for example on a submitted document. |
| **Max Height**  | The tallest the editing area grows, as a CSS length such as `300px`. Longer content scrolls inside it. Frappe offers this property in the DocType's fields table, not in **Customize Form**. |

In a child table row, the editor has no toolbar and no menus, because a grid row has no room for them.

## Image uploads

Images go to Frappe's own `upload_file` endpoint as public files in the **Home** folder, so Frappe's file rules apply to them as they apply to any upload:

| Setting                                                                  | Effect on the editor                                                                                                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Max File Size (MB)** in System Settings                                | The largest file Frappe accepts. When it is empty, Frappe uses `max_file_size` (in bytes) from the site configuration, and 25 MB when that is not set either.               |
| **Allowed File Extensions** in System Settings                           | When set, an image whose extension is not listed is refused.                                                                                                                |
| **Only allow System Managers to upload public files** in System Settings | When ticked, only System Managers can add images, because the editor always uploads public files.                                                                           |
| Write permission on the document                                         | In a saved document, the image is attached to it, and Frappe checks that you may write to that document. In a new, unsaved document the upload is not attached to anything. |

[Images](images.md) explains why the files are public, and [Limitations and troubleshooting](troubleshooting.md#an-image-does-not-upload) lists the messages these rules produce.

## What the app adds to your site

This is the complete list.

| What                | Detail                                                                                                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desk bundle         | `hooks.py` sets `app_include_js = "ui_text_editor.bundle.js"` and `app_include_css = "ui_text_editor.bundle.css"`, so the editor's script and stylesheet load on every desk page. They do not load on website pages or web forms.                                |
| Text Editor control | The bundle replaces the desk's `frappe.ui.form.ControlTextEditor` class in the browser. Every Text Editor field built after it loads, in forms and in dialogs, uses the frappe-ui editor. The form timeline's comment box is a separate control and keeps Quill. |
| Stylesheet          | Every rule of the editor's stylesheet only applies inside the editor and its pop-ups, so it does not restyle the rest of the desk.                                                                                                                               |
| Module              | One module, **Frappe UI Editor Integration**, with no doctypes in it.                                                                                                                                                                                            |
| Doctypes and fields | None. The app adds no doctypes, custom fields or property setters and changes no standard doctype.                                                                                                                                                               |
| Server-side code    | None. The app overrides no doctype class, registers no document events, scheduled jobs or whitelisted methods, and ships no patches. Uploads use Frappe's own `upload_file`.                                                                                     |

## Related

- [Install and upgrade](install.md)
- [Existing content and saved values](saved-values.md) for what the editor writes to the database
- [How it works](development/architecture.md) for the code behind each row above
