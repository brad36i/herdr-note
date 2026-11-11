import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = ["main.js", "model.js", "mod.json"];
const readJSON = path => JSON.parse(readFileSync(path, "utf8"));
const name = value => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)) {
    throw new Error("Layout and mod names must contain only letters, digits, - and _ (max 80).");
  }
  return value;
};

export function appHome(env = process.env, home = homedir()) {
  return resolve(env.HERDR_APP_HOME || join(env.XDG_CONFIG_HOME || join(home, ".config"), "herdr-app"));
}

function* nodes(node) {
  yield node;
  for (const child of node.children ?? []) yield* nodes(child);
}

export function patchToolbar(source) {
  if (source.includes('"note-panel"') || source.includes('"toggle-note"')) {
    throw new Error("This toolbar already includes Note. Choose a layout without Note.");
  }
  const anchors = [...source.matchAll(/^[ \t]*\.when\(enabled\.includes\(["']files["']\),\s*el\s*=>\s*el\.child\(panelButton\(["']files["'],\s*["']Files["'],\s*["'][^"'\r\n]+["']\)\)\)[ \t]*\r?$/gm)];
  if (anchors.length !== 1) throw new Error("Unsupported toolbar: expected one standard Files button. Nothing was changed.");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const button = `      .when(Boolean(find(root, "note-panel")), el => el.child(
        h_flex().id("toggle-note").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
          .accessibility_label("Note panel")
          .text_size(12).bg(find(root, "note-panel")?.hidden ? t.chrome : t.selected)
          .text_color(find(root, "note-panel")?.hidden ? t.muted : t.foreground)
          .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
          .on_click(() => run("layout.toggle", { id: "note-panel" })).child("Note")))
`.replaceAll("\n", newline);
  const index = anchors[0].index;
  return source.slice(0, index) + button + source.slice(index);
}

function structure(tree) {
  const all = [...nodes(tree)];
  if (all.some(node => node.id === "note-panel" || node.content?.mod === "note")) {
    throw new Error("This layout already includes Note. Choose a layout without Note.");
  }
  const tabs = all.filter(node => node.id === "tabs" && node.type === "block" && node.content?.mod);
  const bodies = all.filter(node => node.id === "work-body" && node.type === "row" && Array.isArray(node.children));
  if (tabs.length !== 1 || bodies.length !== 1) throw new Error("Unsupported layout: use Herdr main or a clone with tabs and work-body.");
  return { tabs: tabs[0], body: bodies[0] };
}

export async function install(options = {}) {
  const home = resolve(options.home || appHome());
  const layoutName = name(options.layoutName || "herdr-note"), toolbarName = name(options.toolbarName || "note-tabs");
  if (toolbarName === "note") throw new Error("The toolbar name must differ from note.");
  const env = { ...process.env, HERDR_APP_HOME: home };
  const app = options.app || (args => {
    const output = execFileSync(options.binary || "herdr-app", args, { env, encoding: "utf8", timeout: 30000 });
    if (args[0] === "check") return;
    return JSON.parse(output);
  });
  const command = (action, args) => {
    const response = app(["do", action, JSON.stringify(args)]);
    if (response?.error || response?.ok === false) throw new Error(response.error || `${action} failed`);
    return response;
  };
  const original = name(app(["status"]).layout);
  const sourceLayout = readFileSync(join(home, "layouts", `${original}.json`), "utf8");
  const { tabs } = structure(JSON.parse(sourceLayout));
  const sourceToolbar = name(tabs.content.mod);
  patchToolbar(readFileSync(join(home, "mods", sourceToolbar, "main.js"), "utf8"));
  const layoutPath = join(home, "layouts", `${layoutName}.json`), toolbarPath = join(home, "mods", toolbarName);
  for (const path of [layoutPath, toolbarPath]) if (existsSync(path)) throw new Error(`Destination exists; refusing overwrite: ${path}`);
  const notePath = join(home, "mods", "note");
  const manifest = { ...readJSON(join(root, "mods/note/mod.json")), place: "none" };
  const reusable = existsSync(notePath);
  if (reusable) {
    for (const file of files) {
      const path = join(notePath, file);
      const matches = existsSync(path) && (file === "mod.json"
        ? ["none", "right"].includes(readJSON(path).place) && JSON.stringify({ ...readJSON(path), place: "none" }) === JSON.stringify(manifest)
        : readFileSync(path).equals(readFileSync(join(root, "mods/note", file))));
      if (!matches) throw new Error(`Existing note mod differs; refusing overwrite: ${path}`);
    }
  }
  const plan = { home, original, sourceToolbar, layoutName, toolbarName, reuseNote: reusable };
  if (options.dryRun) return plan;

  // Check only our runtime in a temporary app home; native check must not touch personal state.
  const checkHome = mkdtempSync(join(tmpdir(), "herdr-note-install-"));
  let switched = false;
  try {
    const staged = join(checkHome, "note");
    mkdirSync(staged);
    for (const file of files) writeFileSync(join(staged, file), file === "mod.json" ? JSON.stringify(manifest, null, 2) + "\n" : readFileSync(join(root, "mods/note", file)));
    const check = options.check || (path => execFileSync(options.binary || "herdr-app", ["check", path], {
      env: { ...env, HERDR_APP_HOME: checkHome }, encoding: "utf8", timeout: 30000,
    }));
    check(staged);
    command("mod.clone", { name: sourceToolbar, as: toolbarName });
    const clonedSource = join(toolbarPath, "main.js");
    writeFileSync(clonedSource, patchToolbar(readFileSync(clonedSource, "utf8")));
    check(toolbarPath);
    // A user or another tool may have edited the original while preflight ran.
    if (readFileSync(join(home, "layouts", `${original}.json`), "utf8") !== sourceLayout) {
      throw new Error("Source layout changed during installation. Retry from the intended layout.");
    }
    if (!reusable) {
      const staging = mkdtempSync(join(home, ".note-install-"));
      try {
        for (const file of files) writeFileSync(join(staging, file), readFileSync(join(staged, file)));
        if (existsSync(notePath)) throw new Error("note appeared during installation; refusing overwrite.");
        renameSync(staging, notePath);
      } finally { rmSync(staging, { recursive: true, force: true }); }
    }
    // mod.json uses place:none so discovery cannot auto-dock into the original layout.
    switched = true;
    command("layout.clone", { name: original, as: layoutName });
    const tree = readJSON(layoutPath), target = structure(tree);
    target.tabs.content.mod = toolbarName;
    target.body.children.push({ id: "note-panel", type: "block", content: { mod: "note" }, size: { px: 368 }, min: 240, max: 900 });
    // layout.set targets the currently shown layout, which the user can switch at any moment.
    // Replace only our named clone, then explicitly show it.
    const temporary = mkdtempSync(join(home, ".note-layout-"));
    try {
      const file = join(temporary, "layout.json");
      writeFileSync(file, JSON.stringify(tree, null, 2) + "\n");
      renameSync(file, layoutPath);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
    command("layout.switch", { name: layoutName });
    let status;
    for (let attempt = 0; attempt < 30; attempt++) {
      status = app(["status"]);
      if (status.layout === layoutName && !status.errors?.length) break;
      await delay(100);
    }
    if (status.layout !== layoutName || status.errors?.length) throw new Error(`New layout did not become ready: ${JSON.stringify(status.errors ?? [])}. See herdr-app status.`);
    return plan;
  } catch (error) {
    if (switched) {
      try { command("layout.switch", { name: original }); }
      catch { throw new Error(`Installation failed and automatic layout restore failed. Switch to ${original} in Herdr.`, { cause: error }); }
    }
    throw new Error(`Installation failed. Original layout: ${original}. New copies may remain at ${toolbarPath}, ${layoutPath}, ${notePath}; existing files were not overwritten.`, { cause: error });
  } finally { rmSync(checkHome, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    const flags = { "--home": "home", "--app": "binary", "--layout-name": "layoutName", "--toolbar-name": "toolbarName" };
    for (let i = 2; i < process.argv.length; i++) {
      const flag = process.argv[i];
      if (flag === "--dry-run") options.dryRun = true;
      else if (Object.hasOwn(flags, flag) && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) options[flags[flag]] = process.argv[++i];
      else throw new Error("Usage: node scripts/install.mjs [--dry-run] [--home PATH] [--app PATH] [--layout-name NAME] [--toolbar-name NAME]");
    }
    const plan = await install(options);
    console.log(JSON.stringify(plan, null, 2));
    console.log(options.dryRun ? "Dry run: no files or layout were changed." : `Installed. Use Note to the left of Files. To return, switch to layout ${plan.original}.`);
  } catch (error) {
    console.error(error.message);
    if (error.cause) console.error(error.cause.message);
    process.exitCode = 1;
  }
}
