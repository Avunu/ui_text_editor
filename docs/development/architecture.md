---
title: How it works
description: How the bundle replaces the desk's Text Editor control, how values are converted to and from Quill's markup, and why the stylesheet is scoped.
nav_title: How it works
order: 10
updated: 2026-11-06
---

The app has no server-side behaviour. `hooks.py` adds one script and one stylesheet to every desk page, and everything else happens in the browser.

## Where things live

```text
ui_text_editor/
  hooks.py              app_include_js and app_include_css: the desk bundle
  demo.py               the demo Note for frappe-demo and the screenshots
  tests/                Python smoke tests of the hooks, the bundle names and the demo
  public/dist/          the build output (generated, not committed)
src/
  index.ts              the desk entry point: installs the control
  control.ts            the Text Editor field control; the only code that knows about Frappe
  FrappeEditor.vue      the editor: frappe-ui's Editor, its extensions and menus
  toolbar.ts            the toolbar, the selection menu and the table menu
  html.ts               conversion between the stored value and the editor's HTML
  upload.ts             the one file dialog (frappe.ui.FileUploader) images go through
  images.ts             the editor commands and plugin that lead to it
  scope.ts              the scope class and the portal host for pop-ups
  popups.ts             createApp for frappe-ui's own pop-up apps
  style.css             Tailwind layers and the few rules of the app's own
build/
  scope.ts              the Vite plugin that scopes the stylesheet
  check-scope.mjs       the check that nothing escaped the scope
vite.config.ts          the bundle build, and the pop-up redirect
marketplace/            the registry listing and the screenshot spec
```

## The control

`src/index.ts` runs once when the bundle loads and calls `installTextEditorControl()` (`src/control.ts`). That defines a new `ControlTextEditor` class on top of Frappe's `ControlCode`, as Frappe's own Quill control is, and assigns it to `frappe.ui.form.ControlTextEditor`. Frappe's `make_control` looks the class up by field type each time it builds a control, so every Text Editor field built afterwards, in a form or a dialog, gets the new one. Classes that already extended the old control, such as `ControlComment`, keep Quill.

The control keeps the contract the rest of the desk relies on:

- **Mounting.** `make_input` creates a `div.frappe-editor-root` in the field's input area and mounts a small Vue app with `FrappeEditor.vue`. Its reactive state holds the content, the placeholder (`df.placeholder`, translated), whether it is editable (`!disabled && !df.read_only`, refreshed on every `refresh()`), whether to show the toolbar (not in a grid row) and `df.max_height`.
- **Writing.** The editor emits `change` only for transactions that changed the document, so clicking into a field does not dirty the form. The control converts the HTML with `toFrappe` and writes it to the model 300 ms after the last change (the delay Frappe's Quill control uses), or at once on blur.
- **Reading.** `set_formatted_input` ignores the control's own write coming back from the model, and converts any other value with `fromFrappe`.
- **Parsing.** `parse` removes scripts and styles with `frappe.dom.remove_script_and_style`, as Quill's control does.

## The value conversion

`src/html.ts` has two functions.

`fromFrappe` parses the stored value with `DOMParser` (an inert document: nothing runs or loads), unwraps a single `.ql-editor` root, removes Quill's `ql-ui` and `ql-cursor` elements, turns `ql-align-*` classes into `text-align` styles, and turns Quill's `ol` lists with `data-list="bullet"` into `ul`, and with `checked` or `unchecked` into the editor's task list (`ul data-type="taskList"` with `li data-type="taskItem" data-checked`). Lists with `data-list="ordered"` stay `ol`.

`toFrappe` returns an empty string for an empty editor, and otherwise wraps the HTML in `<div class="ql-editor read-mode">`. The desk, print formats and emails style rich text through that class. The desk's mandatory check before saving (`frappe.model.has_value`) does not strip tags, so a wrapped empty paragraph would count as a value there; the empty string makes it, and "is set" filters, see an empty field.

## The editor

`FrappeEditor.vue` uses frappe-ui's `RichTextKit` with these parts turned off: the kit's heading (replaced by a plain `Heading` with levels 1 to 6, because the kit's version stamps generated ids on every heading), video, attachments, iframes, the image group and viewer, slash commands, emoji, mentions, tags and typography. Mentions, emoji, slash commands and tags open suggestion pop-ups that would sit outside the scoped stylesheet; video, attachments and iframes were never part of the desk's Text Editor; typography would rewrite quotes and dashes in business text.

`src/toolbar.ts` lays the toolbar out like Quill's and defines the items frappe-ui's presets lack: underline, clear formatting, task list, code block, indent and outdent. The selection menu has Bold, Italic, Underline, Strike and Link; the table menu is frappe-ui's `tableToolbar`.

### Images

Images go through Frappe's file dialog, `frappe.ui.FileUploader`, so they get its device, library and link choices and its upload code. Frappe's bundle loads it with the desk. `src/upload.ts` opens it, and `src/images.ts` is the extension that leads frappe-ui's entry points to it:

| Entry point                  | How it gets to the dialog                                                                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The toolbar's **Image**      | frappe-ui's `InsertImage` runs the `selectAndUploadImage` command, which `FrappeImages` replaces. Tiptap merges commands in priority order, so the lower priority wins. The dialog opens empty, and each chosen image goes in with `setImage`. |
| Paste                        | frappe-ui inserts a placeholder and calls `uploadFunction`, which preloads the dialog and resolves with the File document. Several files come one at a time, each waiting for the previous one.                                                |
| Drop                         | `FrappeImages` replaces the `dropFiles` command, so several images skip frappe-ui's gallery dialog: each goes to `uploadImage`, and they all join one dialog.                                                                                  |
| An image's **Replace image** | `FrappeImages` replaces `replaceImage`, so the image stays until the upload is done. frappe-ui's own command swaps it for a placeholder first, which closing the dialog would lose.                                                            |

The dialog does not report everything the editor needs, so `upload.ts` reads it from what the dialog does:

- **Closing.** There is no callback, so it listens for `hidden.bs.modal`. It settles there rather than on success, so that the next file of a multi-file paste opens a dialog of its own instead of joining the closing one.
- **A library choice closes the dialog before it uploads** (`upload_via_file_browser`), so the document can arrive after `hidden.bs.modal`. `upload.ts` wraps the instance's `upload_files`, which the dialog's primary action calls, to know that an upload is running and wait for it.
- **Which file finished.** `on_success` gets the File document only. The dialog sets `doc` on the row of its list just before calling it, so that is how a document finds the placeholder waiting for it. No row means a library or link choice, which goes in at the cursor.
- **A retry after a failure** sends every file in the list again, so a file that already got its document is ignored.

Options passed to the dialog, from `file_uploader.bundle.js` and `FileUploader.vue`:

- `make_attachments_public: true` and `allow_toggle_private: false`: images stay public, for the reason in [Where the file goes](../images.md#where-the-file-goes). The dialog still forces private for a user who may not upload public files (`frappe.utils.can_upload_public_files`), and `upload_file` keeps a library file's own privacy, so `upload.ts` warns when the document it gets back is private.
- `restrictions.allowed_file_types: ["image/*"]`: covers the device and the file input. The library and the link are not restricted, so `upload.ts` checks the extension of what comes back from them.
- `allow_google_drive: false`: its picker closes the dialog first, and its cancel opens the form's attachment dialog.

It also sets `keep_grid_form_open` on the dialog's `frappe.ui.Dialog`, because closing any dialog otherwise closes an open grid row form.

frappe-ui treats a rejected upload as a quiet cancel only when its own `AbortController` fired, and that is out of reach of `uploadFunction`. Any other rejection is shown on the image, with the error's message. So a cancel rejects with the message `UPLOAD_CANCELLED`, and a plugin in `images.ts` removes an image carrying it, in the same transaction, before it can render. Two more things follow from a placeholder that can wait behind a dialog:

- `FrappeEditor.vue` does not report a change while an image is loading, and reports none at all if the document ends up as it was. A cancelled paste leaves the form clean.
- An edit that deletes a placeholder along with other content is split: the placeholder comes out first, out of the undo history, and the history records the rest. Undo can't bring back a placeholder with no upload behind it, which would hold later edits back from the form.
- Transactions that finish an upload stay out of the undo history, which then only records the placeholder being inserted. One undo removes the image, and undo cannot bring back a placeholder with no upload behind it.

Uploads settle one per task. frappe-ui's content watcher can run in the middle of the next node view update, and with two updates in one task it restores the first one's HTML over the second, which loses that image.

## The scoped stylesheet

The bundle loads on every desk page, but frappe-ui expects to own the page: it brings Tailwind's reset, its design tokens on `:root`, and generic class names such as `.flex` and `.border` that the desk's Bootstrap also defines. The build rewrites every rule so it only matches inside `.frappe-editor-root` (`build/scope.ts`): `:root`, `html` and `body` become the scope itself, a leading `[data-theme]` stays outside it so the dark theme still follows the desk, and everything else is prefixed. `yarn check:scope` fails the build if a rule gets through. A new frappe-ui release that adds a rule shape the scoper does not know is the usual cause.

The Tailwind `content` list in `tailwind.config.js` names only the frappe-ui sources the editor renders, so the stylesheet does not carry the whole library. A class missing from that list shows up as an unstyled control.

Two things keep the editor's floating UI inside the scope:

- frappe-ui's overlays (menus, tooltips, dialogs) teleport into one portal host, `div.frappe-editor-root.frappe-editor-portal`, through frappe-ui's `portalTargetKey` (`src/scope.ts`).
- The link, colour and table-size pop-ups mount their own Vue apps directly on `<body>`. `vite.config.ts` routes the `vue` imports made from frappe-ui's editor to `src/popups.ts`, whose `createApp` tags each of those containers with the scope class, sets its `z-index` to 1200 (above Bootstrap's modals at 1050) and points its overlays at the same host.

If a pop-up shows up unstyled, check that it goes through one of those two paths.

One consequence of the scope: frappe-ui's colour palette (`--prose-color-*` and `--prose-highlight-*`) is defined on `.ProseMirror`, inside the editor, while the colours the editor stores refer to those variables. Outside the editor the variables are undefined, so stored colours do not show in read-only views, print formats or emails. See [Limitations](../troubleshooting.md#limitations).

## The build

`vite.config.ts` builds one IIFE, `ui_text_editor.bundle.<hash>.js`, and its stylesheet into `ui_text_editor/public/dist/`. `scripts/vite-register.mjs`, managed by frappe-nix, maps those files to the `ui_text_editor.bundle.js` and `ui_text_editor.bundle.css` keys that `hooks.py` names, in the bench's `sites/assets/assets.json`. `yarn dev` builds under the fixed name `development` instead of a hash, so the registered file stays the same across rebuilds.

The app's `typescript` is the native TypeScript 7 build, which has no JavaScript API. Vue's single-file-component compiler and `vue-tsc` need one, so `typescript5` is an alias of TypeScript 5: `vite.config.ts` registers it with the compiler, and `scripts/vue-tsc.cjs` runs `vue-tsc` against it.
