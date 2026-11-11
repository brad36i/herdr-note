import vm from "node:vm";
import { readFile } from "node:fs/promises";

// Host doubles exercise the real view and its callbacks; native check covers the real builders.
export async function host(saved = new Map(), preferences = new Map()) {
  const state = {
    spaces: [{ id: "s1", name: "Work", machine: null, active: true,
      tabs: [{ id: "t1", name: "First", active: true }, { id: "t2", name: "Second", active: false }] }],
    machines: [{ name: null, layout: "ready" }],
    focus: { space: "s1", tab: "t1" },
    writes: 0, notifications: 0, flushes: 0, inputs: [],
  };
  const cx = { notify() { state.notifications++; } };
  const element = (kind) => {
    const target = { kind, nodes: [], handlers: {}, styles: {} };
    const proxy = new Proxy(target, {
      get(obj, method) {
        if (method in obj) return obj[method];
        return (...args) => {
          if (method === "child") obj.nodes.push(args[0]);
          else if (method === "children") obj.nodes.push(...args[0]);
          else if (method === "when") { if (args[0]) args[1](proxy); }
          else if (String(method).startsWith("on_")) obj.handlers[method] = args[0];
          else obj.styles[method] = args;
          return proxy;
        };
      },
    });
    return proxy;
  };
  const input = ({ value = "" }) => {
    let text = value;
    const listeners = new Map();
    const result = {
      value: () => text,
      set_value(value) { text = value; listeners.get("change")?.({}, cx); },
      type(value) { this.set_value(value); },
      compose(value) { text = value; },
      set_soft_wrap() {},
      release() { this.released = true; },
      on(name, callback) { listeners.set(name, callback); },
    };
    state.inputs.push(result);
    return result;
  };
  const modules = {
    "gpui-kit": { View: class {}, div: () => element("div") },
    "gpui-base": {
      v_flex: () => element("v_flex"), h_flex: () => element("h_flex"),
      v_resizable: () => element("v_resizable"), resizable_panel: () => element("resizable_panel"),
      TextareaState: { new: input }, Textarea: { new: () => element("Textarea") },
    },
    herdr: {
      spaces: () => state.spaces, machines: () => state.machines, focused: () => state.focus,
      shared: key => saved.get(key),
      setShared(key, value) { saved.set(key, value); state.writes++; },
      theme: () => ({}),
    },
  };
  const context = vm.createContext({
    localStorage: {
      getItem: key => preferences.get(key) ?? null,
      setItem: (key, value) => preferences.set(key, value),
      async flush() { state.flushes++; },
    },
  });
  const cache = new Map();
  async function load(file) {
    const url = new URL(file, import.meta.url);
    if (cache.has(url.href)) return cache.get(url.href);
    const mod = new vm.SourceTextModule(await readFile(url, "utf8"), { context, identifier: url.href });
    cache.set(url.href, mod);
    await mod.link(async (name, parent) => {
      if (modules[name]) {
        const exports = modules[name];
        return new vm.SyntheticModule(Object.keys(exports), function () {
          for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        }, { context });
      }
      return load(new URL(name, parent.identifier).href);
    });
    return mod;
  }
  const mod = await load("../mods/note/main.js");
  await mod.evaluate();
  const view = new mod.namespace.default();
  view.init();
  return { view, state, saved, preferences, cx };
}

export function find(root, predicate) {
  if (!root || typeof root !== "object") return null;
  if (predicate(root)) return root;
  for (const node of root.nodes ?? []) {
    const match = find(node, predicate);
    if (match) return match;
  }
  return null;
}
