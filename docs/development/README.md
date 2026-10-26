---
title: Develop Rich Text Editor for Desk
description: The dev shell, the build and its commands, the tests, CI, the release flow, and how to check these docs.
nav_title: Development
order: 9
updated: 2026-10-26
---

This page is for people changing the app. [How it works](architecture.md) explains the code: the control, the value conversion and the CSS scoping.

## Set up

The repository is a [frappe-nix](https://docs.avunu.net/frappe-nix/docs/) app. `nix develop --no-pure-eval` (or `direnv allow`, which loads the same shell) gives you Node 24 or newer, yarn, the Python tools, the git hooks and a dev bench under `.frappe-nix/bench` with this app installed.

```bash
nix develop --no-pure-eval
prek install
yarn install
yarn build
```

Without Nix, work in the app's folder inside a Frappe v16 bench (`apps/ui_text_editor`) with Node 24 and yarn, and run `yarn install` and `yarn build` there.

## Commands

| Command                            | What it does                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `yarn build`                       | Builds the bundle, then registers it in the bench's `sites/assets/assets.json` (`scripts/vite-register.mjs`, which skips itself outside a bench) |
| `yarn build:bundle`                | Builds the bundle only, without registering it                                                                                                   |
| `yarn dev`                         | Builds and registers the bundle, then rebuilds on change under a fixed file name. Reload the desk to pick up a change                            |
| `yarn typecheck`                   | Type-checks the code, including the Vue component through `vue-tsc`                                                                              |
| `yarn lint`, `yarn lint:fix`       | Runs oxlint                                                                                                                                      |
| `yarn format`, `yarn format:check` | Runs oxfmt                                                                                                                                       |
| `yarn test`                        | Runs the unit tests of the CSS scoping (`build/scope.test.ts`)                                                                                   |
| `yarn check:scope`                 | Checks that no rule of the built stylesheet can match outside the editor. Run it after a build                                                   |
| `frappe-test --reuse-site`         | Runs the Python tests on the dev site, with coverage, the way CI runs them                                                                       |
| `frappe-shots`                     | Rebuilds the demo site from `ui_text_editor/demo.py` and retakes the screenshots in `docs/screenshots/`                                          |

## Tests

| File                                 | Covers                                                                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build/scope.test.ts`                | How each kind of selector is scoped: ordinary selectors, `:root`, `html` and `body`, class names that only look like them, and the dark theme switch                          |
| `ui_text_editor/tests/test_hooks.py` | The app is installed, `hooks.py` names the two bundles, the Vite config writes those names, and, where the bundle is built and registered, each one resolves to a hashed file |
| `ui_text_editor/tests/test_demo.py`  | The demo hook creates the demo Note in Quill's markup, once                                                                                                                   |

The built-bundle test in `test_hooks.py` skips itself when the bundle is not built or not registered. The nightly integration run sets `UI_TEXT_EDITOR_REQUIRE_BUNDLE=1` (`nightly-suites` in `pyproject.toml`), and then a missing bundle fails it.

There are no browser tests of the editor itself. The screenshots that `frappe-shots` takes (`marketplace/screenshots.ts`) open the demo Note and check that the converted content, a table included, appears in the editor.

## Continuous integration

`.github/workflows/ci.yml` is managed by frappe-nix and runs the shared gates on every pull request, every push to `develop` and once a day. Each is a check named `ci / <gate>`:

- `ci / lint`: the pre-commit hooks, run with prek.
- `ci / typecheck`: `frappe-nix gate typecheck`. For this app that includes the scoping tests, a bundle build and `yarn check:scope` (the `ci:typecheck` script in `package.json`).
- `ci / test`: the Python tests with coverage (`frappe-test`) and `ty`.
- `ci / marketplace`: the registry checks of `marketplace/listing.toml`, `hooks.py` and the logo.

`pr-policy.yml` adds `ci / pr-policy`, which checks a pull request's base, title and commits (conventional commits, see `committed.toml`). `nightly.yml` runs the integration suite against a built bench, retakes the screenshots and checks links; it is never a required check. `deps.yml` relocks after dependency updates.

The `Docs` workflow (`.github/workflows/docs.yml`) checks this documentation when `docs/` changes: see [Working on these docs](#working-on-these-docs).

The managed files, the gates and the policies are described once for every app in the [app standards documentation](https://docs.avunu.net/frappe-nix/docs/app-standards/).

## Releases

`release.yml` runs release-please on `develop`. Merging its release pull request tags the version, writes `CHANGELOG.md`, bumps `package.json` and `ui_text_editor/__init__.py`, and fast-forwards the `version-16` branch that `bench get-app --branch version-16` installs from. `fix:` commits make a patch release and `feat:` commits a minor one. The major version follows the Frappe major and is never bumped by a commit.

## Conventions

- Every source file starts with the copyright header the `validate_copyright` hook checks. The hook skips `docs/`, so these pages start with their front matter.
- Do not edit files whose header says they are managed by frappe-nix, or the regions between `frappe-nix:begin` and `frappe-nix:end` markers in `README.md`. `frappe-init --sync` writes them; `nix run --no-pure-eval .#frappe-init -- --check` reports drift.
- Keep the bundle entry in `src/`, not in `ui_text_editor/public/`: Frappe's esbuild compiles every `*.bundle.*` file it finds under `public/` on its own, without Vue, Tailwind or PostCSS.

## Working on these docs

The documentation is Markdown in `docs/`. It is published with the other Avunu projects at [docs.avunu.net/ui-text-editor/docs/](https://docs.avunu.net/ui-text-editor/docs/) by [Avunu/site-docs](https://github.com/Avunu/site-docs). Write the files so that they read well on GitHub too: front matter, GitHub alerts and relative links. The screenshots in `docs/screenshots/` are generated by `frappe-shots`; do not edit them by hand.

To check a change as the pull request check does, clone Avunu/site-docs beside this repository and, from its folder (Node 22.19 or newer), run:

```bash
npm ci --ignore-scripts && npm run build
node build/cli.js check --only ui-text-editor --source ui-text-editor=../ui_text_editor
```

Use `build --lenient` instead of `check` to write a preview of the site into `dist/`. See [previewing](https://github.com/Avunu/site-docs/blob/main/docs/guide/previewing.md).
