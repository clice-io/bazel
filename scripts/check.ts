/// Check the records: every version's archive is downloadable from its
/// release with those bytes and holds that MODULE.bazel, and (with BASE, the
/// pull request's base commit) no published record changes. A record goes
/// only after its archive: to take a version down, delete its asset (or its
/// release) first, then remove its records in a pull request. A pull request
/// titled "replace: ..." may change records (publish.ts --replace).
///
///   [BASE=<commit>] [TITLE=<pull request title>] node scripts/check.ts

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fail, gh, moduleCall, readArchive, readModules, releaseAssets, releaseTag, releaseUrl, REPO, ROOT, sha256Hex } from "./registry.ts";

const git = (args: string[]) => {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) fail(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
};
const base = process.env.BASE;
if (base) {
  const removed = new Set<string>();
  for (const line of git(["diff", "--name-status", "--no-renames", "--diff-filter=DM", base, "HEAD", "--", "modules"]).split("\n").filter(Boolean)) {
    const [status, file] = line.split("\t");
    if (status === "M") {
      if (!process.env.TITLE?.startsWith("replace:")) fail(`${file}: a published record cannot change`);
      console.log(`${file}: replaced`);
      continue;
    }
    const [, name, version] = file!.split("/");
    removed.add(releaseTag(name!, version!));
  }
  for (const tag of removed) {
    if (releaseAssets(tag)?.size) fail(`${tag}: removed while its release still holds its archive`);
    console.log(`${tag}: removed, its archive gone`);
  }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "registry-"));
let count = 0;
for (const [name, versions] of readModules()) {
  for (const [version, module] of versions) {
    const tag = releaseTag(name, version);
    const where = `modules/${name}/${version}`;
    const called = moduleCall(module.module, `${where}/MODULE.bazel`);
    if (called.name !== name || called.version !== version) fail(`${where}: its MODULE.bazel is ${called.name} ${called.version}`);
    const file = module.source.url.split("/").pop()!;
    if (module.source.url !== releaseUrl(tag, file)) fail(`${where}: ${module.source.url} is not in the release ${tag}`);
    if (releaseAssets(tag)?.get(file) !== sha256Hex(module.source.integrity)) fail(`${tag}/${file}: not in the release with these bytes`);
    gh(["release", "download", tag, "-R", REPO, "-p", file, "-D", work, "--clobber"]);
    const archive = readArchive(path.join(work, file));
    if (archive.strip_prefix !== module.source.strip_prefix) fail(`${where}: the archive's directory is ${archive.strip_prefix}`);
    if (archive.module !== module.module) fail(`${where}: the archive holds another MODULE.bazel`);
    count++;
  }
}
console.log(`${count} versions: every archive is downloadable and holds its MODULE.bazel`);
