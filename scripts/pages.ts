/// Write the registry into a gh-pages checkout: bazel_registry.json, and for
/// every module its metadata.json (the versions, from modules/) and every
/// version's MODULE.bazel and source.json.
///
///   node scripts/pages.ts <gh-pages checkout>

import fs from "node:fs";
import path from "node:path";
import { compareVersions, fail, MODULES, readModules } from "./registry.ts";

const out = process.argv[2];
if (!out) fail("node scripts/pages.ts <gh-pages checkout>");
fs.rmSync(path.join(out, "modules"), { recursive: true, force: true });
if (fs.existsSync(MODULES)) fs.cpSync(MODULES, path.join(out, "modules"), { recursive: true });
fs.writeFileSync(path.join(out, "bazel_registry.json"), JSON.stringify({ mirrors: [] }, null, 2) + "\n");
for (const [name, versions] of readModules()) {
  const metadata = {
    versions: [...versions.keys()].sort(compareVersions),
    yanked_versions: {},
  };
  fs.writeFileSync(path.join(out, "modules", name, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
  console.log(`${name}: ${metadata.versions.join(", ")}`);
}
