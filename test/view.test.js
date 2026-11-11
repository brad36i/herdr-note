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
