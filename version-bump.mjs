// Run by `npm version`: copies the new package.json version into manifest.json
// and records the minimum Obsidian version it needs in versions.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const version = process.env.npm_package_version;
if (!version) throw new Error("Run this through `npm version <patch|minor|major>`");

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = version;
writeFileSync("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

const versions = existsSync("versions.json") ? JSON.parse(readFileSync("versions.json", "utf8")) : {};
versions[version] = manifest.minAppVersion;
writeFileSync("versions.json", `${JSON.stringify(versions, null, 2)}\n`);
