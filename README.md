# herdr-note

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

`note` is a Herdr mod that shows notes for the current Space and tab in a right-hand panel.
Open or close it with the **Note button immediately to the left of Files** in the top-right toolbar.

- **Space, on top:** one long-term note for shared project context.
- **Tab, below:** one working note for the selected tab. Closing the tab deletes its note.
- Plain text, autosave, collapsible sections, adjustable section heights and panel width.
- The panel's open or closed state applies across the current layout. Its notes follow the current Space and tab.
- Agents in the same tab share its note. Switching Agents or hiding the panel does not delete notes.

Use `−` and `+` beside each Space or Tab heading to adjust that area's note text independently.
The default is 13px, with 1px steps from 10 to 28px; headings and buttons stay the same size.
These are area settings, retained when switching Spaces or tabs and after restarting the app.

This mod is for the **Herdr desktop app**. The installer supports the default `main` layout and
copies that retain its structure, based on Herdr 0.1.14 and 0.1.15. Compatibility with every custom
layout or operating system is not guaranteed. See [VALIDATION.md](VALIDATION.md) (Korean) for the test scope.

## Installation

Installation requires **Node 22 or later**, a running Herdr app, and the `herdr-app` CLI on your PATH.
Once installed, the mod runs without Node or npm. No extra packages or `npm install` are needed.

```sh
git clone https://github.com/brad36i/herdr-note.git
cd herdr-note
node scripts/install.mjs --dry-run
node scripts/install.mjs
```

`--dry-run` only shows the planned changes. Installation copies your current layout to `herdr-note`
and its tab bar to `note-tabs`, adds Note immediately to the left of Files in the copy, and switches
to the new layout with the notes panel on the right. It does not overwrite your original layout,
tab bar, key settings, or existing notes.

The installed `mods/note/mod.json` uses `place: none` to prevent automatic docking in your original
layout. An identical existing note runtime can be reused. Conflicting files, layout names, or tab
bar names stop installation rather than being overwritten. The installer also leaves custom
layouts unchanged if it cannot find the expected structure.

Layout and mod names support only ASCII letters, digits, `-`, and `_`. Copied tab bars and layouts
do not automatically receive future updates to their originals. Run the installation separately
on each computer; notes do not sync between computers.

Use these options to set paths or names for the new copies. Put paths containing spaces in quotes.

```sh
node scripts/install.mjs --home "/path/to/herdr-app" --app "/path/to/herdr-app"
node scripts/install.mjs --layout-name my-note-layout --toolbar-name my-note-tabs
```

`--home` sets the Herdr app home directory; `--app` sets the CLI executable path. On Windows,
you can use `--app "C:\path\to\herdr-app.exe"`. On every OS, the app home is resolved in this order:

1. `--home`
2. `HERDR_APP_HOME`
3. `XDG_CONFIG_HOME/herdr-app`
4. `.config/herdr-app` under your user home directory

If installation fails, the installer attempts to return to the previous layout. Newly created
copies remain for troubleshooting. Check the paths printed by the installer before removing them.

## Storage and deletion

Notes are stored in **plain text** under the `note.state` key in the app home's `shared.json`.
The mod uses Herdr's storage API and does not read or write files directly. Notes are linked by
machine, Space, and tab IDs, so renaming or reordering them preserves their notes. A newly created
tab with the same name has a different note.

Each text change updates the saved state; Herdr handles writing it to disk. Notes are restored
after a normal app restart if the same tab is restored. OS logout or computer shutdown does not
itself delete notes, but the same tab ID must be restored to keep using that tab's note. The last
changes before a forced shutdown or power loss are not guaranteed to survive.

A tab note is removed only when its machine's layout is `ready` and the tab is actually gone.
Loading or being offline alone never triggers deletion. This also covers a tab disappearing when
its last terminal exits. **Deleted tab notes have no trash or recovery feature.** If a tab disappears
while the mod is disabled, the mod checks the list and removes its note the next time it loads.

Space notes are not automatically deleted when a Space closes. There is no separate search or
recovery screen for notes from closed Spaces. Multiple mod copies share the same notes; when the
same note is edited concurrently, the last edit wins. There is no sync between computers.

## Reverting and uninstalling

Use Herdr's layout menu to select the layout you used before installation. For example, if you
previously used `main`, you can return to it with:

```sh
herdr-app do layout.switch '{"name":"main"}'
```

If you use a different app home, set the same `HERDR_APP_HOME` used during installation. You can
also use the app's layout menu if your shell, such as PowerShell, handles JSON arguments differently.
Before removing the new layout, tab bar copy, or `mods/note`, check that nothing still references
them. The installer prints their paths. **Do not delete the entire `shared.json` to uninstall note:**
it also contains data from other mods.

## Security and verification

The note runtime does not send network requests, run shell commands, read the clipboard, or send
notes to Agents. Herdr mods run as trusted code. Notes are not protected from other mods or programs
running under the same user account. Do not use this mod to store passwords or API keys.

The installer reads local files, creates copies, and runs the Herdr CLI. See
[SECURITY.md](SECURITY.md) (Korean) for runtime and installer effects, and
[VALIDATION.md](VALIDATION.md) (Korean) for test results and remaining gaps.

All **38 automated tests pass on Linux, macOS, and Windows** with Node 22 in GitHub Actions.
TypeScript checkJs, ESLint, and native Herdr checks also pass. Native views and app restart were
verified on Linux with Herdr 0.1.14; the installer and restart were verified with 0.1.15.
Native macOS and Windows GUI behavior, physical IME input, OS logout, reboot, and power loss
remain untested.

```sh
npm test
npm run check
```

`npm run check` requires `herdr-app`. To use an already installed TypeScript CLI, set `NOTE_TSC`
to its `typescript/bin/tsc` path. Tests use Node's experimental VM module API, so a warning may appear.

For the development plan and implementation notes, see [PLAN.md](PLAN.md) and
[RECIPE.md](RECIPE.md), both in Korean.
