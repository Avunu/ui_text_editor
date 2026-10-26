---
title: Install and upgrade
description: Install Rich Text Editor for Desk on a Frappe v16 bench, build its bundle, upgrade it, and remove it again.
nav_title: Install
order: 1
updated: 2026-10-26
---

Rich Text Editor for Desk installs like any Frappe app. The one thing specific to it is the build: the editor is a Vite bundle that `bench build` has to produce before the desk can load it.

## Before you start

- A bench with Frappe v16 and the site you want the editor on.
- Node and yarn on the bench machine. The app is built with Node 24 in CI.
- A System Manager login on the site, to check the result.

## Install

Run these from the bench directory. `<SITE_NAME>` is your site, for example `site1.example.com`.

```bash
bench get-app https://github.com/Avunu/ui_text_editor --branch version-16
bench --site <SITE_NAME> install-app ui_text_editor
```

The `version-16` branch is created by the first release. Until then, install from `develop`:

```bash
bench get-app https://github.com/Avunu/ui_text_editor --branch develop
bench --site <SITE_NAME> install-app ui_text_editor
```

`bench get-app` builds the app's assets. Frappe's build runs each app's `build` script from its `package.json`, and runs `yarn install --frozen-lockfile` first when the app has no `node_modules`. For this app that script builds the editor bundle into `ui_text_editor/public/dist/` and registers it in the bench's `sites/assets/assets.json`. The bundle is not in the repository, so if you install from a checkout that was not built, build it before you reload the desk:

```bash
bench build --app ui_text_editor
```

## What installing sets up

Very little. The app has no doctypes, custom fields, property setters, roles, fixtures, settings or patches, and no install hook. Installing it records the app on the site and creates its one module, **Frappe UI Editor Integration**, which holds nothing.

What changes is the desk itself: `hooks.py` adds the editor bundle (`ui_text_editor.bundle.js` and `ui_text_editor.bundle.css`) to every desk page through `app_include_js` and `app_include_css`. Once the bundle loads, every **Text Editor** field built afterwards uses the new editor. [Configuration](configuration.md#what-the-app-adds-to-your-site) lists the details.

## Check the install

1. Reload the desk in your browser, so it loads the new bundle.
2. Open a form with a Text Editor field, for example a new **Note**.
3. The field shows the frappe-ui toolbar, starting with **Heading** and its four buttons. See [Write and format text](editing.md).

If the field still shows the Quill toolbar, see [The field still shows the Quill toolbar](troubleshooting.md#the-field-still-shows-the-quill-toolbar).

## Upgrade

Update the app the way you update any Frappe app: `bench update`, or pull the new code in `apps/ui_text_editor` and then run these from the bench directory.

```bash
bench build --app ui_text_editor
bench --site <SITE_NAME> migrate
```

The build matters: a new version of the editor reaches the desk only once its bundle is built and registered. `bench migrate` has nothing of this app's to change, because the app ships no doctypes and no patches, but it is the usual step after an update and does no harm. Reload the desk afterwards.

## Uninstall

```bash
bench --site <SITE_NAME> uninstall-app ui_text_editor
```

Frappe removes the app from the site's installed apps and deletes its module, **Frappe UI Editor Integration**. From then on the desk no longer includes the editor bundle, and Text Editor fields use Quill again after a reload.

The values written while the app was installed stay as they are. They are wrapped the way Quill wraps its values, so they still render in print formats, emails and read-only views. The app does not convert them back to Quill's own markup, though: check lists, for example, stay in the frappe-ui editor's form (`ul data-type="taskList"`), and how Quill shows such markup when you edit the value again is up to Quill. See [Existing content and saved values](saved-values.md).

The built bundle stays in `apps/ui_text_editor` until you remove the app from the bench with `bench remove-app ui_text_editor`.
