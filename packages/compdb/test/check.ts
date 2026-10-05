/// compdb as its users run it, in the tests' workspace after the tests
/// (packages.yml runs every <package>/check.ts there):
///
/// 1. After a build of something else, which leaves the execution root with
///    only that build's repositories, bazel run @compdb//:refresh --
///    //compdb/... writes compile_commands.json: an entry for each source of
///    compdb/, the C++20 module interface and its importer included, and for
///    the sources they depend on in other repositories (zlib, xclang's std
///    module), and no other.
/// 2. Every entry's directory is the execution root, and its file and its
///    compiler are there, external/ ones included: the refresh leaves the
///    execution root as a build of its targets does.
/// 3. The compiler parses each of those sources with its entry's arguments
///    (-fsyntax-only, outputs left out); the importer with the .modmap and
///    module files the tests' build made.
/// 4. A refresh again writes the same file. Another (-c opt //compdb:hello)
///    has only that program's sources, with that configuration's flags and
///    outputs; one without arguments has the whole workspace's (//...).
/// 5. The script run by itself, not by bazel run, fails saying how to run it.
/// 6. On Linux x64, a workspace of its own with rules_cc's toolchain of the
///    machine (gcc) gets its compile commands too: compdb is not xclang's.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const windows = process.platform === "win32";
const workspace = process.cwd();
const failures: string[] = [];

function check(ok: boolean, what: string): void {
  console.log(`${ok ? "ok" : "FAILED"}: ${what}`);
  if (!ok) failures.push(what);
}

function bazel(cwd: string, args: string[]): string {
  console.log(`+ bazel ${args.join(" ")}  (in ${cwd})`);
  const result = spawnSync("bazel", args, { cwd, encoding: "utf8", shell: windows, stdio: ["ignore", "pipe", "inherit"] });
  if (result.status !== 0) {
    console.error(`error: bazel ${args.join(" ")} failed in ${cwd}`);
    process.exit(1);
  }
  return result.stdout ?? "";
}

interface Entry {
  directory: string;
  file: string;
  arguments: string[];
  output?: string;
}

/// bazel run @compdb//:refresh -- <args>, and the file it wrote.
function refresh(cwd: string, args: string[]): { entries: Entry[]; text: string } {
  bazel(cwd, ["run", "@compdb//:refresh", ...(args.length ? ["--", ...args] : [])]);
  const file = path.join(cwd, "compile_commands.json");
  const text = fs.readFileSync(file, "utf8");
  return { entries: JSON.parse(text), text };
}

/// Paths as one OS spells them: separators, and Windows' case.
const norm = (p: string) => (windows ? path.resolve(p).toLowerCase() : path.resolve(p));
const slashes = (p: string) => p.replaceAll("\\", "/");

/// The entry's compile, without its outputs, only parsing.
function parses(entry: Entry): string | undefined {
  const args: string[] = [];
  for (let i = 1; i < entry.arguments.length; i++) {
    const a = entry.arguments[i]!;
    if (a === "-o" || a === "-MF" || a === "-MT" || a === "-MQ") i++;
    else if (!["-MD", "-MMD"].includes(a) && !a.startsWith("-fmodule-output")) args.push(a);
  }
  const compiler = path.resolve(entry.directory, entry.arguments[0]!);
  const result = spawnSync(compiler, [...args, "-fsyntax-only"], { cwd: entry.directory, encoding: "utf8" });
  if (result.status === 0) return undefined;
  return `${result.error ?? ""}${result.stderr ?? ""}`.slice(0, 3000);
}

/// Windows: packages.yml's startup options, given on its command lines,
/// for every Bazel here too, through the workspace's .bazelrc.
if (windows) fs.appendFileSync(path.join(workspace, ".bazelrc"), "\nstartup --output_user_root=C:/b\nstartup --windows_enable_symlinks\n");

const execroot = bazel(workspace, ["info", "execution_root"]).trim();

/// 1, 2, 3.
bazel(workspace, ["build", "@platforms//host:host"]);
const external = path.join(execroot, "external");
check(!fs.existsSync(external) || !fs.readdirSync(external).some((r) => r.includes("xclang")),
  "a build of something else leaves no xclang repository in the execution root");
const { entries, text } = refresh(workspace, ["//compdb/..."]);
console.log(`${entries.length} entries`);
const files = entries.map((e) => slashes(e.file));
const own = ["compdb/greet.cpp", "compdb/hello.cpp", "compdb/zipper.c", "compdb/shapes.cppm", "compdb/area.cpp"];
for (const source of own) check(files.filter((f) => f === source).length === 1, `one entry for ${source}`);
const zlib = entries.find((e) => /^external\/[^/]*zlib[^/]*\/adler32\.c$/.test(slashes(e.file)));
check(zlib !== undefined, "an entry for zlib's adler32.c, of another repository");
const std = entries.find((e) => /^external\/[^/]*xclang[^/]*\/.*\/std\.cppm$/.test(slashes(e.file)));
check(std !== undefined, "an entry for xclang's std.cppm, of another repository");
const strays = files.filter((f) => !f.startsWith("compdb/") && !f.startsWith("external/"));
check(strays.length === 0, `no entry outside compdb/ and its dependencies${strays.length ? `: ${strays.join(", ")}` : ""}`);
check(entries.every((e) => norm(e.directory) === norm(execroot)), `every entry's directory is the execution root, ${execroot}`);
const missing = entries.filter((e) => !fs.existsSync(path.resolve(e.directory, e.file)) ||
  !fs.existsSync(path.resolve(e.directory, e.arguments[0]!)));
check(missing.length === 0, `every entry's file and compiler are in the execution root` +
  (missing.length ? `, not ${missing.map((e) => e.file).slice(0, 5).join(", ")}` : ""));
check(entries.every((e) => e.output !== undefined && fs.existsSync(path.resolve(e.directory, e.output))),
  "every entry's output is the tests' build's");
for (const entry of [...own.map((s) => entries.find((e) => slashes(e.file) === s)), zlib, std]) {
  if (!entry) continue;
  const error = parses(entry);
  check(error === undefined, `the compiler parses ${slashes(entry.file)} with its entry's arguments${error ? `:\n${error}` : ""}`);
}

/// 4.
const again = refresh(workspace, ["//compdb/..."]);
check(again.text === text, "a refresh again writes the same compile_commands.json");
const opt = refresh(workspace, ["-c", "opt", "//compdb:hello"]).entries;
check(opt.map((e) => slashes(e.file)).sort().join(" ") === "compdb/greet.cpp compdb/hello.cpp",
  `-c opt //compdb:hello: the entries of hello.cpp and greet.cpp only (${opt.map((e) => e.file).join(", ")})`);
check(opt.every((e) => e.arguments.includes("-O2") && /-opt\//.test(slashes(e.output ?? ""))),
  "-c opt //compdb:hello: optimized compiles, into the opt configuration's outputs");
const all = refresh(workspace, []).entries;
check(all.some((e) => slashes(e.file) === "zlib/zlib_test.c") && all.some((e) => slashes(e.file) === "compdb/area.cpp"),
  `no arguments: the whole workspace (${all.length} entries, zlib/zlib_test.c among them)`);

/// 5.
const bin = bazel(workspace, ["info", "bazel-bin"]).trim();
const repo = fs.readdirSync(path.join(bin, "external")).find((r) => /^compdb\+?$/.test(r));
const script = path.join(bin, "external", repo ?? "compdb+", windows ? "refresh.bat" : "refresh.sh");
const env = { ...process.env };
delete env.BUILD_WORKSPACE_DIRECTORY;
const alone = spawnSync(windows ? "cmd.exe" : script, windows ? ["/c", script] : [], { encoding: "utf8", env });
check(alone.status !== 0 && /bazel run @compdb\/\/:refresh/.test(alone.stderr ?? ""),
  `${path.basename(script)} by itself fails, saying to use bazel run (${(alone.stderr ?? "").trim()})`);

/// 6.
if (process.platform === "linux" && os.arch() === "x64") {
  const module = fs.readFileSync(path.join(workspace, "MODULE.bazel"), "utf8");
  const dep = /^bazel_dep\(name = "compdb".*\)\n^archive_override\(module_name = "compdb".*\)$/m.exec(module)?.[0];
  if (!dep) {
    console.error("error: no compdb archive_override in the tests' MODULE.bazel");
    process.exit(1);
  }
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "compdb-gcc-"));
  fs.writeFileSync(path.join(other, "MODULE.bazel"), `module(name = "gcc_workspace")\n\nbazel_dep(name = "rules_cc", version = "0.2.25")\n${dep}\n`);
  fs.copyFileSync(path.join(workspace, ".bazelversion"), path.join(other, ".bazelversion"));
  fs.writeFileSync(path.join(other, "BUILD.bazel"),
    `load("@rules_cc//cc:cc_binary.bzl", "cc_binary")\n\ncc_binary(\n    name = "main",\n    srcs = ["main.cc"],\n)\n`);
  fs.writeFileSync(path.join(other, "main.cc"), "#include <iostream>\nint main() { std::cout << \"gcc\\n\"; }\n");
  bazel(other, ["build", "//:main"]);
  const gcc = refresh(other, []).entries;
  const main = gcc.find((e) => e.file === "main.cc");
  check(gcc.length === 1 && main !== undefined, `another workspace, rules_cc's toolchain: one entry, main.cc (${main?.arguments[0]})`);
  if (main) {
    const error = parses(main);
    check(error === undefined, `another workspace: its compiler parses main.cc${error ? `:\n${error}` : ""}`);
  }
  bazel(other, ["shutdown"]);
}

if (failures.length) {
  console.error(`error: ${failures.length} checks failed`);
  process.exit(1);
}
console.log("compdb: all checks passed");
