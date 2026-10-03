/// Third-party libraries packaged here, one directory each in packages/:
///
///   packages/<name>/source.json   the library's release: url, sha256 and
///                                 strip_prefix
///   packages/<name>/test/         a package that uses it, built by CI
///   packages/<name>/...           everything else: MODULE.bazel (the
///                                 module's name and version), BUILD.bazel
///                                 and any other file of the module
///
/// The module's source archive is the release's source, checked by its
/// sha256, without any Bazel file of its own, with the package's files on
/// top: one directory, <name>-<version>. The same sources give the same
/// bytes, so publishing an unchanged package again is a no-op.
///
///   node scripts/package.ts archive <dir> [<name>...]
///       <dir>/<name>-<version>.tar.gz of every package (or those named)
///   node scripts/package.ts workspace <dir>
///       work/tests: a workspace with every archive of <dir> in place of
///       its version (archive_override) and every package's test/, which
///       packages.yml builds and tests with xclang's toolchain

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fail, integrity, moduleCall, ROOT } from "./registry.ts";

const PACKAGES = path.join(ROOT, "packages");
const WORK = path.join(ROOT, "work");

interface Source {
  url: string;
  sha256: string;
  strip_prefix: string;
}

function run(cmd: string, args: string[]): void {
  console.log(`+ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) fail(`${cmd} exited with ${result.status}`);
}

function packages(names: string[]): string[] {
  const all = fs.readdirSync(PACKAGES).filter((n) => fs.existsSync(path.join(PACKAGES, n, "source.json"))).sort();
  for (const n of names) if (!all.includes(n)) fail(`no package ${n}`);
  return names.length ? names : all;
}

/// A release's source, downloaded once into work/downloads.
async function download(source: Source): Promise<string> {
  const file = path.join(WORK, "downloads", `${source.sha256}-${path.basename(new URL(source.url).pathname)}`);
  if (!fs.existsSync(file)) {
    const response = await fetch(source.url);
    if (!response.ok) fail(`${source.url}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== source.sha256) fail(`${source.url}: sha256 ${sha256}, not ${source.sha256}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  return file;
}

/// The Bazel files a release may carry, which the package's replace.
const BAZEL_FILES = new Set(["BUILD", "BUILD.bazel", "MODULE.bazel", "MODULE.bazel.lock", "REPO.bazel",
  "WORKSPACE", "WORKSPACE.bazel", "WORKSPACE.bzlmod", ".bazelrc", ".bazelversion"]);

/// A package's archive and its top directory, <name>-<version>.
function topDir(name: string): string {
  const module = moduleCall(fs.readFileSync(path.join(PACKAGES, name, "MODULE.bazel"), "utf8"), `packages/${name}/MODULE.bazel`);
  if (module.name !== name) fail(`packages/${name}/MODULE.bazel names ${module.name}`);
  return `${name}-${module.version}`;
}

async function archive(name: string, dir: string): Promise<string> {
  const pkg = path.join(PACKAGES, name);
  const source: Source = JSON.parse(fs.readFileSync(path.join(pkg, "source.json"), "utf8"));
  const top = topDir(name);
  const stage = path.join(WORK, "package", name);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  run("tar", ["-xf", await download(source), "-C", stage]);
  const root = path.join(stage, top);
  fs.renameSync(path.join(stage, source.strip_prefix), root);
  for (const entry of fs.readdirSync(root, { recursive: true }) as string[]) {
    if (BAZEL_FILES.has(path.basename(entry))) fs.rmSync(path.join(root, entry), { force: true });
  }
  for (const entry of fs.readdirSync(pkg)) {
    if (entry !== "source.json" && entry !== "test") fs.cpSync(path.join(pkg, entry), path.join(root, entry), { recursive: true });
  }
  /// The same bytes from the same sources: sorted, no owners or times, the
  /// same modes whatever the umask.
  const out = path.resolve(dir, `${top}.tar.gz`);
  fs.mkdirSync(dir, { recursive: true });
  run("bash", ["-c", `set -o pipefail; tar -C "$0" --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --mode=a+rX,u+w,go-w -cf - "$1" | gzip -9n > "$2"`,
    stage, top, out]);
  console.log(`${out}: ${integrity(fs.readFileSync(out))}`);
  return out;
}

/// work/tests: tests/ (the workspace's settings), MODULE.bazel with every
/// package's archive of <dir> in place of its version, and every package's
/// test/ as <name>/.
function workspace(dir: string): void {
  const work = path.join(WORK, "tests");
  fs.rmSync(work, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, "tests"), work, { recursive: true });
  const lines = [fs.readFileSync(path.join(ROOT, "tests", "MODULE.bazel"), "utf8")];
  for (const name of packages([])) {
    const strip_prefix = topDir(name);
    const file = path.resolve(dir, `${strip_prefix}.tar.gz`);
    if (!fs.existsSync(file)) fail(`no ${file}`);
    const version = strip_prefix.slice(name.length + 1);
    const url = `file://${process.platform === "win32" ? "/" : ""}${file.replaceAll("\\", "/")}`;
    lines.push(`bazel_dep(name = "${name}", version = "${version}")`,
      `archive_override(module_name = "${name}", urls = ["${url}"], integrity = "${integrity(fs.readFileSync(file))}", strip_prefix = "${strip_prefix}")`, "");
    const tests = path.join(PACKAGES, name, "test");
    if (fs.existsSync(tests)) fs.cpSync(tests, path.join(work, name), { recursive: true });
  }
  fs.writeFileSync(path.join(work, "MODULE.bazel"), lines.join("\n"));
  console.log(work);
}

const [command, dir, ...names] = process.argv.slice(2);
if (command === "archive" && dir) {
  for (const name of packages(names)) await archive(name, dir);
} else if (command === "workspace" && dir) {
  workspace(dir);
} else {
  fail("archive <dir> [<name>...] | workspace <dir>");
}
