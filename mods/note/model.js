/** @typedef {'space' | 'tab'} Scope */
/** @typedef {{scope: Scope, key: string, machine: string | null, space: string, tab?: string, label: string}} Context */
/** @typedef {{text: string, machine: string | null, space: string, tab?: string}} Note */
/** @typedef {{version: 1, spaces: Record<string, Note>, tabs: Record<string, Note>}} State */
/** @typedef {{id: string, name: string, active?: boolean}} Tab */
/** @typedef {{id: string, name: string, machine: string | null, active?: boolean, tabs: Tab[]}} Space */
/** @typedef {{name: string | null, layout: 'loading' | 'ready' | 'unavailable'}} Machine */

export const STATE_KEY = 'note.state';

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
/** @param {unknown} value @returns {value is string} */
const id = (value) => typeof value === 'string' && value.length > 0;
/** @param {string | null} machine @param {string} space @param {string | undefined} [tab] */
const key = (machine, space, tab) => JSON.stringify(tab === undefined ? [machine, space] : [machine, space, tab]);

/** Validate without repairing: damaged storage must never be silently overwritten.
 * @param {unknown} raw @returns {State}
 */
export function readState(raw) {
  if (raw === null || raw === undefined) return { version: 1, spaces: {}, tabs: {} };
  if (!record(raw) || raw.version !== 1 || !record(raw.spaces) || !record(raw.tabs)) {
    throw new Error('note: unsupported or damaged saved data');
  }
  for (const scope of /** @type {const} */ (['spaces', 'tabs'])) {
    for (const [savedKey, note] of Object.entries(raw[scope])) {
      if (!record(note) || typeof note.text !== 'string' || !id(note.space)
        || !(note.machine === null || id(note.machine))
        || (scope === 'tabs' ? !id(note.tab) : note.tab !== undefined)
        || savedKey !== key(/** @type {string | null} */ (note.machine), note.space, /** @type {string | undefined} */ (note.tab))) {
        throw new Error('note: unsupported or damaged saved data');
      }
    }
  }
  return /** @type {State} */ (raw);
}

/** @param {Space[]} spaces @param {{space?: string | null, tab?: string | null} | null | undefined} focus */
export function contexts(spaces, focus) {
  const space = focus?.space ? spaces.find((s) => s.id === focus.space) : spaces.find((s) => s.active);
  if (!space) return { space: null, tab: null };
  const tab = focus?.tab ? space.tabs.find((t) => t.id === focus.tab) : space.tabs.find((t) => t.active);
  /** @type {Context} */
  const spaceContext = { scope: 'space', key: key(space.machine, space.id), machine: space.machine, space: space.id, label: space.name };
  /** @type {Context | null} */
  const tabContext = tab ? { scope: 'tab', key: key(space.machine, space.id, tab.id), machine: space.machine, space: space.id, tab: tab.id, label: tab.name } : null;
  return { space: spaceContext, tab: tabContext };
}

/** @param {State} state @param {Context | null} context */
export function getText(state, context) {
  return context ? state[context.scope === 'space' ? 'spaces' : 'tabs'][context.key]?.text ?? '' : '';
}

/** Updates one entry in the latest state; unrelated notes keep their identity.
 * @param {State} state @param {Context} context @param {string} text @returns {State}
 */
export function setText(state, context, text) {
  const scope = context.scope === 'space' ? 'spaces' : 'tabs';
  if (getText(state, context) === text) return state;
  const entries = { ...state[scope] };
  if (text === '') delete entries[context.key];
  else {
    entries[context.key] = { text, machine: context.machine, space: context.space,
      ...(context.scope === 'tab' ? { tab: context.tab } : {}) };
  }
  return { ...state, [scope]: entries };
}

/** A missing context is actionable only after its machine has loaded successfully.
 * @param {Context | null} context @param {Space[]} spaces @param {Machine[]} machines
 */
export function canEdit(context, spaces, machines) {
  if (!context || !machines.some((m) => m.name === context.machine && m.layout === 'ready')) return false;
  const space = spaces.find((s) => s.machine === context.machine && s.id === context.space);
  return Boolean(space && (context.scope === 'space' || space.tabs.some((t) => t.id === context.tab)));
}

/** Prune closed tabs, including closures while the app was off; keep Space notes.
 * @param {State} state @param {Space[]} spaces @param {Machine[]} machines @returns {State}
 */
export function pruneTabs(state, spaces, machines) {
  const ready = new Set(machines.filter((m) => m.layout === 'ready').map((m) => m.name));
  const live = new Set(spaces.flatMap((s) => s.tabs.map((t) => key(s.machine, s.id, t.id))));
  const removed = Object.keys(state.tabs).filter((k) => ready.has(state.tabs[k].machine) && !live.has(k));
  if (!removed.length) return state;
  const tabs = { ...state.tabs };
  for (const k of removed) delete tabs[k];
  return { ...state, tabs };
}
