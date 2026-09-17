import esbuild from "esbuild";
import { builtinModules } from "node:module";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const production = process.argv[2] === "production";
const ARTEFACTS = ["main.js", "manifest.json", "styles.css"];

// local.config.json (gitignored) names the vault plugin folder to copy builds into.
async function installToVault() {
  if (!existsSync("local.config.json")) return;
  const { pluginDir } = JSON.parse(await readFile("local.config.json", "utf8"));
  if (!pluginDir) return;
  await mkdir(pluginDir, { recursive: true });
  await Promise.all(ARTEFACTS.map((file) => copyFile(file, path.join(pluginDir, file))));
  console.log(`installed → ${pluginDir}`);
}

const installPlugin = {
  name: "install-to-vault",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length === 0) await installToVault();
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules],
  format: "cjs",
  target: "es2021",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  minify: production,
  treeShaking: true,
  outfile: "main.js",
  plugins: [installPlugin],
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
