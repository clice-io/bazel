/// Publish module source archives: upload each to its release
/// (`<name>-<version>`, created if need be), then write its records under
/// modules/. action.yml commits the records through a pull request that
/// merges itself once check.yml has passed; pages.yml then rebuilds the
/// registry.
///
///   node scripts/publish.ts [--replace] <archive>...
///
/// An archive holds one directory, the module's root, whose MODULE.bazel
/// names the module and its version. A version, once published, keeps its
/// archive: publishing it again with other bytes is refused (publish a new
/// version instead), with the same bytes it is a no-op. --replace replaces
/// it, for the registry's experimental days: lock files that recorded the
/// old one need updating. Every archive is checked before anything changes.

import fs from "node:fs";
import path from "node:path";
import { fail, gh, integrity, MODULES, readArchive, readModules, releaseAssets, releaseTag, releaseUrl, REPO, sha256Hex, type Module } from "./registry.ts";

const replace = process.argv[2] === "--replace";
const files = process.argv.slice(replace ? 3 : 2);
if (!files.length) fail("node scripts/publish.ts [--replace] <archive>...");

const published = readModules();
const modules = new Map<string, { file: string; module: Module }>();
for (const file of files) {
  const archive = readArchive(file);
  const tag = releaseTag(archive.name, archive.version);
  const module: Module = {
    name: archive.name,
    version: archive.version,
    module: archive.module,
    source: {
      integrity: integrity(fs.readFileSync(file)),
      strip_prefix: archive.strip_prefix,
      url: releaseUrl(tag, path.basename(file)),
    },
  };
  const known = published.get(module.name)?.get(module.version);
  if (!replace && known && JSON.stringify(known.source) !== JSON.stringify(module.source)) fail(`${tag}: published with another archive`);
  if (!replace && known && known.module !== module.module) fail(`${tag}: published with another MODULE.bazel`);
  if (modules.has(tag)) fail(`${tag}: two archives`);
  const digest = releaseAssets(tag)?.get(path.basename(file));
  if (!replace && digest && digest !== sha256Hex(module.source.integrity)) fail(`${tag}/${path.basename(file)}: the release holds other bytes`);
  modules.set(tag, { file, module });
}

/// Archives first, records last: the registry never names an archive that
/// cannot be downloaded yet. What did not arrive whole is uploaded again.
for (const [tag, { file, module }] of modules) {
  if (!releaseAssets(tag)) {
    gh(["release", "create", tag, "-R", REPO, "--title", tag, "--notes", `Bazel module ${module.name} ${module.version}`]);
  }
  const name = path.basename(file);
  for (let attempt = 1; ; attempt++) {
    const assets = releaseAssets(tag) ?? new Map();
    if (assets.get(name) === sha256Hex(module.source.integrity)) break;
    if (attempt > 3) fail(`${tag}: upload failed`);
    for (const other of assets.keys()) {
      if (other === name || replace) gh(["release", "delete-asset", tag, other, "-R", REPO, "--yes"]);
    }
    gh(["release", "upload", tag, "-R", REPO, file], { allowFailure: true });
  }
  const dir = path.join(MODULES, module.name, module.version);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "MODULE.bazel"), module.module);
  fs.writeFileSync(path.join(dir, "source.json"), JSON.stringify(module.source, null, 2) + "\n");
  console.log(`${tag}: published`);
}
