import assert from "node:assert/strict";
import test from "node:test";
import { host, find } from "./host.js";
import { STATE_KEY, contexts, getText } from "../mods/note/model.js";

test("a repaint during Korean composition does not replace the native input", async () => {
  const h = await host();
  h.view.render();
  const input = h.view.editors.tab.input;
  input.type("한글 ");
  input.compose("한글 이");
  // A focus/status/size repaint may precede the committed change event.
  h.view.render();
  assert.equal(input.value(), "한글 이");
  input.type("한글 입력");
  h.view.render();
  assert.equal(input.value(), "한글 입력");
});

test("switching tabs retains the outgoing native composition", async () => {
  const h = await host();
  h.view.render();
  h.view.editors.tab.input.type("한글 ");
  h.view.editors.tab.input.compose("한글 입력");
  h.state.focus.tab = "t2";
  h.view.render();
  h.state.focus.tab = "t1";
  h.view.render();
  assert.equal(h.view.editors.tab.input.value(), "한글 입력");
});

test("normal view closure retains native composition for an open tab", async () => {
  const h = await host();
  h.view.render();
  h.view.editors.tab.input.compose("마지막 입력");
  await h.view.close();
  const selected = contexts(h.state.spaces, h.state.focus);
  assert.equal(getText(h.saved.get(STATE_KEY), selected.tab), "마지막 입력");
});

test("close releases both editors and flushes preferences if final note saving fails", async () => {
  const h = await host();
  h.view.render();
  h.view.editors.space.input.compose("unsaved Space");
  h.view.editors.tab.input.compose("unsaved Tab");
  const damaged = { version: 900, text: "preserve original" };
  h.saved.set(STATE_KEY, damaged);
  await h.view.close();
  assert.equal(h.saved.get(STATE_KEY), damaged);
  assert.equal(h.state.writes, 0);
  assert.equal(h.state.inputs.every(input => input.released), true);
  assert.equal(h.state.flushes, 1);
});

test("switching immediately preserves the last edit in its original tab", async () => {
  const h = await host();
  h.view.render();
  const first = h.view.editors.tab.input;
  first.type("first, without waiting\n한글 입력");
  h.view.editors.space.input.type("Space instructions");
  h.state.focus.tab = "t2";
  h.view.render();
  assert.equal(h.view.editors.tab.input.value(), "");
  h.view.editors.tab.input.type("second");
  h.state.focus.tab = "t1";
  h.view.render();
  assert.equal(h.view.editors.tab.input.value(), "first, without waiting\n한글 입력");
  assert.equal(h.view.editors.space.input.value(), "Space instructions");
  assert.equal(h.state.inputs.length, 2);
});

test("closing a tab removes only its note and stale callbacks cannot restore it", async () => {
  const h = await host();
  h.view.render();
  h.view.editors.space.input.type("keep Space");
  const old = h.view.editors.tab.input;
  old.type("closed tab");
  h.state.spaces[0].tabs.shift();
  // Even before a new render, a queued editor event cannot save a closed tab.
  old.type("must not resurrect");
  h.state.focus.tab = "t2";
  h.view.render();
  assert.equal(Object.keys(h.saved.get(STATE_KEY).tabs).length, 0);
  await h.view.close();
  old.type("late callback after view closed");
  assert.equal(Object.keys(h.saved.get(STATE_KEY).tabs).length, 0);
  assert.equal(h.view.editors.space.input.value(), "keep Space");
});

test("app restart restores notes and offline/loading snapshots never erase them", async () => {
  const h = await host();
  h.view.render();
  h.view.editors.space.input.type("long term");
  h.view.editors.tab.input.type("same open tab");
  await h.view.close();
  const restored = await host(new Map(JSON.parse(JSON.stringify([...h.saved]))));
  for (const layout of ["loading", "unavailable"]) {
    restored.state.machines[0].layout = layout;
    restored.state.spaces = [];
    restored.view.render();
    assert.equal(Object.keys(restored.saved.get(STATE_KEY).tabs).length, 1);
  }
  restored.state.spaces = h.state.spaces;
  restored.state.machines[0].layout = "ready";
  restored.view.render();
  assert.equal(restored.view.editors.space.input.value(), "long term");
  assert.equal(restored.view.editors.tab.input.value(), "same open tab");
});

test("interleaved copies preserve changes to the other memo", async () => {
  const saved = new Map(), a = await host(saved), b = await host(saved);
  a.view.render(); b.view.render();
  a.view.editors.space.input.type("Space from a");
  b.view.editors.tab.input.type("Tab from b");
  a.view.render(); b.view.render();
  assert.equal(a.view.editors.tab.input.value(), "Tab from b");
  assert.equal(b.view.editors.space.input.value(), "Space from a");
});

test("collapse and native split sizes persist without losing text", async () => {
  const h = await host();
  let tree = h.view.render();
  h.view.editors.space.input.type("keep while folded");
  find(tree, n => n.kind === "v_resizable").handlers.on_resize([180, 420]);
  find(tree, n => n.styles.id?.[0] === "note-space-toggle").handlers.on_click({}, h.cx);
  tree = h.view.render();
  assert.equal(find(tree, n => n.kind === "v_resizable"), null);
  assert.equal(h.view.editors.space.input.value(), "keep while folded");
  await h.view.close();
  const restored = await host(h.saved, h.preferences);
  restored.view.render();
  assert.equal(restored.view.folded.space, true);
  assert.equal(JSON.stringify(restored.view.sizes), "[180,420]");
  assert.equal(restored.view.editors.space.input.value(), "keep while folded");
});

test("corrupt note data is preserved and editing stops", async () => {
  const damaged = { version: 900, text: "must survive" };
  const h = await host(new Map([[STATE_KEY, damaged]]));
  h.view.render();
  assert.equal(h.view.editors.space.context, null);
  assert.equal(h.view.editors.tab.context, null);
  assert.equal(h.saved.get(STATE_KEY), damaged);
  assert.equal(h.state.writes, 0);
});

test("renaming, unrelated renders and duplicate events do not rewrite or rebuild editors", async () => {
  const h = await host();
  h.view.render();
  const editor = h.view.editors.tab.input;
  editor.type("unchanged");
  const count = h.state.writes;
  h.state.spaces[0].tabs[0].name = "renamed";
  for (let i = 0; i < 30; i++) h.view.render();
  editor.type("unchanged");
  assert.equal(h.view.editors.tab.input, editor);
  assert.equal(h.state.inputs.length, 2);
  assert.equal(h.state.writes, count);
  const selected = contexts(h.state.spaces, h.state.focus);
  assert.equal(getText(h.saved.get(STATE_KEY), selected.tab), "unchanged");
});

function fontControl(h, scope, action) {
  const tree = h.view.render();
  const button = find(tree, n => n.styles.id?.[0] === `note-${scope}-font-${action}`);
  assert.ok(button, `${scope} ${action} control exists`);
  button.handlers.on_click({}, h.cx);
  return button;
}

test("font controls change each area's body independently and retain the header size", async () => {
  const h = await host();
  h.view.render();
  assert.equal(JSON.stringify(h.view.fontSizes), '{"space":13,"tab":13}');
  fontControl(h, "space", "plus");
  fontControl(h, "tab", "minus");
  const tree = h.view.render();
  assert.equal(tree.styles.text_size[0], 13);
  for (const [scope, size] of [["space", 14], ["tab", 12]]) {
    const section = find(tree, n => n.styles.id?.[0] === `note-${scope}`);
    assert.equal(find(section, n => n.kind === "Textarea").styles.text_size[0], size);
    const label = find(section, n => n.styles.id?.[0] === `note-${scope}-font-size`);
    assert.ok(label.nodes.some(n => String(n) === String(size)));
    assert.equal(h.view.folded[scope], false);
  }
  assert.equal(h.state.stopped, 2);
  assert.equal(h.state.writes, 0);
});

test("font controls stop at both bounds and visibly disable further changes", async () => {
  const h = await host();
  const disabled = button => button.styles.disabled?.[0] === true || button.styles.opacity?.[0] < 1;
  for (let i = 0; i < 25; i++) fontControl(h, "space", "plus");
  assert.equal(h.view.fontSizes.space, 28);
  assert.ok(disabled(fontControl(h, "space", "plus")));
  for (let i = 0; i < 25; i++) fontControl(h, "space", "minus");
  assert.equal(h.view.fontSizes.space, 10);
  assert.ok(disabled(fontControl(h, "space", "minus")));
  assert.equal(h.view.fontSizes.tab, 13);
  assert.equal(h.state.stopped, 52);
  assert.equal(h.view.folded.space, false);
});

test("font preferences survive a restart together with existing panel settings", async () => {
  const h = await host();
  fontControl(h, "space", "plus");
  fontControl(h, "tab", "minus");
  let tree = h.view.render();
  find(tree, n => n.kind === "v_resizable").handlers.on_resize([180, 420]);
  find(tree, n => n.styles.id?.[0] === "note-space-toggle").handlers.on_click({}, h.cx);
  const saved = JSON.parse(h.preferences.get("panel"));
  assert.deepEqual(saved.fontSizes, { space: 14, tab: 12 });
  assert.deepEqual(saved.sizes, [180, 420]);
  assert.equal(saved.folded.space, true);
  await h.view.close();
  const restored = await host(h.saved, h.preferences);
  tree = restored.view.render();
  assert.equal(JSON.stringify(restored.view.fontSizes), '{"space":14,"tab":12}');
  assert.equal(restored.view.folded.space, true);
  assert.equal(JSON.stringify(restored.view.sizes), "[180,420]");
  // Controls remain usable when the section is folded.
  fontControl(restored, "space", "plus");
  assert.equal(restored.view.fontSizes.space, 15);
  assert.equal(restored.view.folded.space, true);
});

test("old or malformed font preferences use safe per-area defaults", async () => {
  const old = await host(new Map(), new Map([["panel", JSON.stringify({ folded: { tab: true }, sizes: [200, 400] })]]));
  assert.equal(JSON.stringify(old.view.fontSizes), '{"space":13,"tab":13}');
  assert.equal(old.view.folded.tab, true);
  assert.equal(JSON.stringify(old.view.sizes), "[200,400]");
  for (const bad of [9, 29, 13.5, "18", null, {}, []]) {
    const prefs = new Map([["panel", JSON.stringify({ fontSizes: { space: bad, tab: 18 } })]]);
    const h = await host(new Map(), prefs);
    assert.equal(h.view.fontSizes.space, 13);
    assert.equal(h.view.fontSizes.tab, 18);
  }
  const broken = await host(new Map(), new Map([["panel", "not JSON"]]));
  assert.equal(JSON.stringify(broken.view.fontSizes), '{"space":13,"tab":13}');
});

test("resizing type preserves pending composition and editor identity across tab switches", async () => {
  const h = await host();
  h.view.render();
  const editors = { space: h.view.editors.space.input, tab: h.view.editors.tab.input };
  editors.tab.type("한글 ");
  editors.tab.compose("한글 조합 중");
  const writes = h.state.writes;
  fontControl(h, "tab", "plus");
  h.view.render();
  assert.equal(editors.tab.value(), "한글 조합 중");
  assert.equal(h.state.writes, writes);
  h.state.focus.tab = "t2";
  h.view.render();
  assert.equal(h.view.fontSizes.tab, 14);
  h.state.focus.tab = "t1";
  h.view.render();
  assert.equal(h.view.editors.space.input, editors.space);
  assert.equal(h.view.editors.tab.input, editors.tab);
  assert.equal(h.state.inputs.length, 2);
  assert.equal(editors.tab.value(), "한글 조합 중");
});
