---
title: How it works
description: How the bundle replaces the desk's Text Editor control, how values are converted to and from Quill's markup, and why the stylesheet is scoped.
nav_title: How it works
order: 10
updated: 2026-10-26
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
  upload.ts             image uploads to Frappe's upload_file
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

`toFrappe` returns an empty string for an empty editor, and otherwise wraps the HTML in `<div class="ql-editor read-mode">`. The desk, print formats and emails style rich text through that class, and Frappe's mandatory check strips tags, so an empty paragraph would otherwise count as a value.

## The editor

`FrappeEditor.vue` uses frappe-ui's `RichTextKit` with these parts turned off: the kit's heading (replaced by a plain `Heading` with levels 1 to 6, because the kit's version stamps generated ids on every heading), video, attachments, iframes, the image group and viewer, slash commands, emoji, mentions, tags and typography. Mentions, emoji, slash commands and tags open suggestion pop-ups that would sit outside the scoped stylesheet; video, attachments and iframes were never part of the desk's Text Editor; typography would rewrite quotes and dashes in business text.

`src/toolbar.ts` lays the toolbar out like Quill's and defines the items frappe-ui's presets lack: underline, clear formatting, task list, code block, indent and outdent. The selection menu has Bold, Italic, Underline, Strike and Link; the table menu is frappe-ui's `tableToolbar`.

`src/upload.ts` posts images to `/api/method/upload_file` with the CSRF token, `is_private=0` and `folder=Home`, and the document's doctype, name and field when the form is saved. It reports progress to the editor and turns Frappe's `_server_messages` into the error the editor shows.

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
