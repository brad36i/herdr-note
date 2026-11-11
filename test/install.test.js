import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { appHome, patchToolbar, install } from "../scripts/install.mjs";

// Minimal compatible host structure; integration tests exercise real files and failure recovery.
const toolbar = `import { View } from "gpui-kit";
export default class Tabs extends View {
  render() {
    return h_flex()
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")));
  }
}
`;
const layout = () => ({ id: "root", type: "column", children: [
  { id: "tabs", type: "block", content: { mod: "tabs" } },
  { id: "work-body", type: "row", children: [{ id: "main", type: "block", content: { tab: "active" } }] },
] });

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), "note install 한글 "));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, "layouts")); mkdirSync(join(home, "mods/tabs"), { recursive: true });
  writeFileSync(join(home, "layouts/main.json"), JSON.stringify(layout()));
  writeFileSync(join(home, "mods/tabs/main.js"), toolbar);
  writeFileSync(join(home, "shared.json"), '{"existing":"keep private data"}');
  const state = { layout: "main", errors: [], commands: [], checks: [], fail: null };
  const app = args => {
    if (args[0] === "status") return { layout: state.layout, errors: state.errors };
    const action = args[1], values = JSON.parse(args[2]);
    state.commands.push(action);
    if (action === state.fail && values.name !== "main") throw new Error("simulated host failure");
    if (action === "mod.clone") {
      cpSync(join(home, "mods", values.name), join(home, "mods", values.as), { recursive: true, errorOnExist: true, force: false });
    } else if (action === "layout.clone") {
      cpSync(join(home, "layouts", `${values.name}.json`), join(home, "layouts", `${values.as}.json`), { errorOnExist: true, force: false });
      state.layout = values.as;
      if (state.switchDuringClone) state.layout = "main";
    } else if (action === "layout.set") {
      writeFileSync(join(home, "layouts", `${state.layout}.json`), JSON.stringify(values.layout));
    } else if (action === "layout.switch") state.layout = values.name;
    else throw new Error(`Unexpected host command: ${action}`);
    return { ok: true };
  };
  return { home, state, app, check: path => state.checks.push(path) };
}

test("app home follows Herdr precedence using platform paths and Unicode overrides", () => {
  assert.equal(appHome({ HERDR_APP_HOME: "custom path 한글", XDG_CONFIG_HOME: "ignored" }), join(process.cwd(), "custom path 한글"));
  assert.equal(appHome({ XDG_CONFIG_HOME: "/config" }), resolve("/config", "herdr-app"));
  assert.equal(appHome({}, "/users/person"), resolve("/users/person", ".config", "herdr-app"));
});

test("the toolbar insertion preserves original text and CRLF and precedes Files", () => {
  for (const newline of ["\n", "\r\n"]) {
    const before = toolbar.replaceAll("\n", newline), after = patchToolbar(before);
    const start = after.indexOf('      .when(Boolean(find(root, "note-panel"))');
    const end = after.indexOf('      .when(enabled.includes("files")');
    assert.ok(start < end);
    assert.equal(after.slice(0, start) + after.slice(end), before);
    assert.equal(after.includes('run("layout.toggle", { id: "note-panel" })'), true);
    if (newline === "\r\n") assert.equal(after.replaceAll("\r\n", "").includes("\n"), false);
  }
  assert.throws(() => patchToolbar("unsupported"), /Unsupported toolbar/);
  assert.throws(() => patchToolbar(toolbar + toolbar), /Unsupported toolbar/);
  assert.throws(() => patchToolbar(patchToolbar(toolbar)), /already includes Note/);
});

test("dry run and unsupported layouts do not create files or call mutating host commands", async t => {
  const f = fixture(t);
  const plan = await install({ ...f, dryRun: true });
  assert.equal(plan.layoutName, "herdr-note");
  assert.deepEqual(f.state.commands, []);
  assert.deepEqual(f.state.checks, []);
  assert.equal(existsSync(join(f.home, "mods/note")), false);
  writeFileSync(join(f.home, "layouts/main.json"), '{"id":"root"}');
  await assert.rejects(install(f), /Unsupported layout/);
  assert.deepEqual(f.state.commands, []);
});

test("installation clones the local toolbar and layout while preserving originals and memo storage", async t => {
  const f = fixture(t);
  const original = readFileSync(join(f.home, "layouts/main.json"), "utf8");
  await install(f);
  assert.equal(readFileSync(join(f.home, "layouts/main.json"), "utf8"), original);
  assert.equal(readFileSync(join(f.home, "mods/tabs/main.js"), "utf8"), toolbar);
  assert.equal(readFileSync(join(f.home, "shared.json"), "utf8"), '{"existing":"keep private data"}');
  assert.equal(f.state.layout, "herdr-note");
  const tree = JSON.parse(readFileSync(join(f.home, "layouts/herdr-note.json"), "utf8"));
  assert.equal(tree.children[0].content.mod, "note-tabs");
  assert.equal(tree.children[1].children.at(-1).id, "note-panel");
  assert.equal(JSON.parse(readFileSync(join(f.home, "mods/note/mod.json"), "utf8")).place, "none");
  assert.equal(f.state.checks.length, 2);
  f.state.layout = "main";
  await assert.rejects(install(f), /Destination exists/);
});

test("path traversal and conflicting destination files are rejected before any mutations", async t => {
  const f = fixture(t);
  for (const options of [{ layoutName: "../outside" }, { toolbarName: "../outside" }, { toolbarName: "note" }]) {
    await assert.rejects(install({ ...f, ...options }));
  }
  mkdirSync(join(f.home, "mods/note"));
  writeFileSync(join(f.home, "mods/note/main.js"), "foreign mod: do not replace");
  await assert.rejects(install(f), /Existing note mod differs/);
  assert.equal(readFileSync(join(f.home, "mods/note/main.js"), "utf8"), "foreign mod: do not replace");
  assert.deepEqual(f.state.commands, []);
});

test("native check failure never switches layouts and final apply failure restores the original", async t => {
  const f = fixture(t);
  await assert.rejects(install({ ...f, check: () => { throw new Error("check failed"); } }), /Installation failed/);
  assert.deepEqual(f.state.commands, []);
  f.state.fail = "layout.switch";
  await assert.rejects(install(f), /Installation failed/);
  assert.equal(f.state.layout, "main");
  assert.equal(f.state.commands.at(-1), "layout.switch");
  assert.equal(readFileSync(join(f.home, "mods/tabs/main.js"), "utf8"), toolbar);
});

test("a user switching layouts during installation cannot redirect edits into the original", async t => {
  const f = fixture(t);
  const original = readFileSync(join(f.home, "layouts/main.json"), "utf8");
  f.state.switchDuringClone = true;
  await install(f);
  assert.equal(readFileSync(join(f.home, "layouts/main.json"), "utf8"), original);
  assert.equal(f.state.commands.includes("layout.set"), false);
  assert.equal(f.state.layout, "herdr-note");
});

test("an identical runtime can be reused and host errors restore the original layout", async t => {
  const f = fixture(t);
  cpSync(new URL("../mods/note", import.meta.url), join(f.home, "mods/note"), { recursive: true });
  const plan = await install({ ...f, dryRun: true });
  assert.equal(plan.reuseNote, true);
  f.state.errors = ["simulated render error"];
  await assert.rejects(install(f), /Installation failed/);
  assert.equal(f.state.layout, "main");
  assert.equal(f.state.commands.at(-1), "layout.switch");
});
