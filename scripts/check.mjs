import { readdir, readFile, mkdtemp, rm, cp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const mod = join(root, "mods/note");
for (const name of await readdir(mod)) {
  if (!name.endsWith(".js")) continue;
  const file = join(mod, name), source = await readFile(file, "utf8");
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (/\b(fetch|exec|hc|eval|setTimeout|setInterval)\s*\(|\bcx\.timer\.|["'](?:node:|fs\/)/.test(source)) {
    throw new Error(`${name}: unexpected runtime I/O, process execution, or polling`);
  }
}
JSON.parse(await readFile(join(mod, "mod.json"), "utf8"));
const checkHome = await mkdtemp(join(tmpdir(), "note-check-"));
try {
  const checkMod = join(checkHome, "mods/note");
  await cp(mod, checkMod, { recursive: true });
  execFileSync("herdr-app", ["check", checkMod], {
    env: { ...process.env, HERDR_APP_HOME: checkHome }, stdio: "inherit",
  });
  if (process.env.NOTE_TSC) {
    execFileSync(process.execPath, [process.env.NOTE_TSC, "--noEmit", "--allowJs", "--checkJs",
      "--skipLibCheck", "--target", "ES2022", "--module", "ESNext", "--moduleResolution", "bundler",
      "--lib", "ES2022", join(checkMod, "main.js"), join(checkMod, "model.js"), join(checkMod, "gpui-kit.d.ts")],
    { stdio: "inherit" });
    console.log("TypeScript check passed against native-generated API declarations.");
  }
} finally {
  await rm(checkHome, { recursive: true, force: true });
}
console.log("Syntax, runtime I/O policy, manifest and native checks passed.");
