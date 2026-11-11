import assert from 'node:assert/strict';
import test from 'node:test';
import { STATE_KEY, readState, contexts, getText, setText, canEdit, pruneTabs } from '../mods/note/model.js';

const ready = [{ name: null, layout: 'ready' }];
const tab = (id, active = false, name = id) => ({ id, name, active });
const space = (id = 's1', tabs = [tab('t1', true)], machine = null, active = true) => ({ id, name: id, tabs, machine, active });
const selected = (spaces, focus) => contexts(spaces, focus);

test('defaults and persisted restart preserve Space and tab text exactly', () => {
  assert.equal(STATE_KEY, 'note.state');
  let state = readState(null);
  const context = selected([space()]);
  state = setText(state, context.space, '장기 메모\n  공백 유지\n');
  state = setText(state, context.tab, 'tab text\n');
  const restored = readState(JSON.parse(JSON.stringify(state)));
  assert.equal(getText(restored, context.space), '장기 메모\n  공백 유지\n');
  assert.equal(getText(restored, context.tab), 'tab text\n');
  assert.equal(readState(restored), restored);
  assert.deepEqual(readState(undefined), readState(null));
  assert.equal(getText(restored, null), '');
});

test('rename and reorder keep IDs; switching tabs isolates their notes', () => {
  const before = [space('s1', [tab('t1', true), tab('t2')])];
  const first = selected(before);
  let state = setText(readState(null), first.space, 'space');
  state = setText(state, first.tab, 'first tab');
  const after = [{ ...before[0], name: 'renamed space', tabs: [tab('t2'), tab('t1', true, 'renamed tab')] }];
  const renamed = selected(after);
  assert.equal(renamed.space.key, first.space.key);
  assert.equal(renamed.tab.key, first.tab.key);
  assert.equal(getText(state, renamed.tab), 'first tab');
  assert.equal(renamed.tab.label, 'renamed tab');
  const second = selected(after, { space: 's1', tab: 't2' });
  state = setText(state, second.tab, 'second tab');
  assert.equal(getText(state, first.tab), 'first tab');
  assert.equal(getText(state, second.tab), 'second tab');
  assert.equal(getText(state, second.space), 'space');
});

test('focus wins over active flags; stale explicit focus never picks another note', () => {
  const spaces = [space(), space('s2', [tab('t2', true)], null, false)];
  assert.equal(selected(spaces, { space: 's2', tab: 't2' }).tab.tab, 't2');
  assert.deepEqual(selected(spaces, { space: 'closed', tab: 't1' }), { space: null, tab: null });
  const stale = selected(spaces, { space: 's1', tab: 'closed' });
  assert.equal(stale.space.space, 's1');
  assert.equal(stale.tab, null);
  assert.deepEqual(selected([], null), { space: null, tab: null });
});

test('agent changes and multiple agents in one tab do not change its note', () => {
  const context = selected([space()], { space: 's1', tab: 't1', agent: 'codex1' });
  const state = setText(readState(null), context.tab, 'shared work');
  const otherAgent = selected([space()], { space: 's1', tab: 't1', agent: 'claude2' });
  assert.equal(getText(state, otherAgent.tab), 'shared work');
});

test('identity distinguishes machines and names that sanitizing would collide', () => {
  const local = selected([space('s/1', [tab('t:1', true)])]);
  const remote = selected([space('s/1', [tab('t:1', true)], 'server')]);
  const similar = selected([space('s_1', [tab('t_1', true)])]);
  let state = setText(readState(null), local.tab, 'local');
  state = setText(state, remote.tab, 'remote');
  state = setText(state, similar.tab, 'similar');
  assert.equal(Object.keys(state.tabs).length, 3);
  assert.equal(getText(state, local.tab), 'local');
  assert.equal(getText(state, remote.tab), 'remote');
});

test('closed tabs are removed without changing Space notes or live tabs', () => {
  const initial = [space('s1', [tab('t1', true), tab('t2')])];
  const first = selected(initial);
  const second = selected(initial, { space: 's1', tab: 't2' });
  let state = setText(readState(null), first.space, 'long-term');
  state = setText(state, first.tab, 'closed');
  state = setText(state, second.tab, 'alive');
  assert.equal(pruneTabs(state, initial, ready), state);
  const next = pruneTabs(state, [space('s1', [tab('t2', true)])], ready);
  assert.equal(getText(next, first.tab), '');
  assert.equal(getText(next, second.tab), 'alive');
  assert.equal(next.spaces, state.spaces);
  assert.equal(getText(state, first.tab), 'closed');
});

test('closing the last tab also preserves its Space note', () => {
  const context = selected([space()]);
  let state = setText(readState(null), context.space, 'retain after Space closes');
  state = setText(state, context.tab, 'remove');
  const cleaned = pruneTabs(state, [], ready);
  assert.deepEqual(cleaned.tabs, {});
  assert.equal(getText(cleaned, context.space), 'retain after Space closes');
  assert.equal(canEdit(context.space, [], ready), false);
  assert.equal(canEdit(context.tab, [], ready), false);
});

test('loading, unavailable, unknown and disconnected machines never trigger deletion', () => {
  const context = selected([space('s1', [tab('t1', true)], 'remote')]);
  const state = setText(readState(null), context.tab, 'offline note');
  for (const machines of [[], ready, [{ name: 'remote', layout: 'loading' }], [{ name: 'remote', layout: 'unavailable' }]]) {
    assert.equal(pruneTabs(state, [], machines), state);
    assert.equal(canEdit(context.tab, [space('s1', [tab('t1', true)], 'remote')], machines), false);
  }
  const online = [{ name: 'remote', layout: 'ready' }];
  assert.equal(pruneTabs(state, [space('s1', [tab('t1', true)], 'remote')], online), state);
  assert.deepEqual(pruneTabs(state, [], online).tabs, {});
});

test('pruning one ready machine preserves identical IDs on an unavailable machine', () => {
  const local = selected([space()]);
  const remote = selected([space('s1', [tab('t1', true)], 'remote')]);
  let state = setText(readState(null), local.tab, 'local');
  state = setText(state, remote.tab, 'remote');
  const next = pruneTabs(state, [], [...ready, { name: 'remote', layout: 'unavailable' }]);
  assert.equal(getText(next, local.tab), '');
  assert.equal(getText(next, remote.tab), 'remote');
});

test('empty text deletes one entry; unchanged text does not allocate state', () => {
  const context = selected([space()]);
  const empty = readState(null);
  assert.equal(setText(empty, context.tab, ''), empty);
  const state = setText(empty, context.tab, 'text');
  assert.equal(setText(state, context.tab, 'text'), state);
  assert.equal(state.spaces, empty.spaces);
  assert.deepEqual(empty.tabs, {});
  assert.deepEqual(setText(state, context.tab, '').tabs, {});
});

test('canEdit blocks closed or moved contexts and accepts only ready live contexts', () => {
  const spaces = [space()];
  const context = selected(spaces);
  assert.equal(canEdit(context.space, spaces, ready), true);
  assert.equal(canEdit(context.tab, spaces, ready), true);
  assert.equal(canEdit(null, spaces, ready), false);
  assert.equal(canEdit(context.tab, [space('s2')], ready), false);
  assert.equal(canEdit(context.tab, [space('s1', [])], ready), false);
});

test('corrupt or future storage is rejected and left untouched', () => {
  const context = selected([space()]);
  const valid = setText(readState(null), context.tab, 'keep');
  const malformed = [false, '', [], {}, { ...valid, version: 2 }, { ...valid, tabs: [] },
    { ...valid, spaces: null }, { ...valid, tabs: { bad: Object.values(valid.tabs)[0] } },
    { ...valid, tabs: { [context.tab.key]: { text: 4, machine: null, space: 's1', tab: 't1' } } },
    { ...valid, tabs: { [context.tab.key]: { text: 'keep', machine: null, space: 's1' } } },
    { ...valid, spaces: { [context.space.key]: { text: 'keep', machine: null, space: 's1', tab: 't1' } } }];
  for (const raw of malformed) {
    const before = JSON.stringify(raw);
    assert.throws(() => readState(raw), /unsupported or damaged/);
    assert.equal(JSON.stringify(raw), before);
  }
});
