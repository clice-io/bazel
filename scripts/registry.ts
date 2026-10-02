/// What the scripts share: the registry's layout, reading a module out of
/// its source archive, and GitHub releases through the gh CLI.
///
/// The registry is static files in the layout of the Bazel Central
/// Registry. Every version of every module is one GitHub release of this
/// repository, tagged `<name>-<version>`, holding its source archive.
/// `modules/<name>/<version>/MODULE.bazel` and `source.json` on main are the
/// records of every version ever published, committed through pull
/// requests; gh-pages (https://bazel.clice.io) holds them with each
/// module's metadata.json, built from them.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const REPO = "clice-io/bazel";
export const ROOT = path.resolve(import.meta.dirname, "..");
export const MODULES = path.join(ROOT, "modules");

/// source.json of a version: where its archive is and what it holds.
export interface Source {
  integrity: string;
  strip_prefix: string;
  url: string;
}

export interface Module {
  name: string;
  version: string;
  /// Its MODULE.bazel, as the archive holds it.
  module: string;
  source: Source;
}

export function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

export function releaseTag(name: string, version: string): string {
  return `${name}-${version}`;
}

export function releaseUrl(tag: string, file: string): string {
  return `https://github.com/${REPO}/releases/download/${tag}/${file}`;
}

export function integrity(bytes: Buffer): string {
  return `sha256-${crypto.createHash("sha256").update(bytes).digest("base64")}`;
}

/// The sha256 of an integrity string, in hex as GitHub reports an asset's.
export function sha256Hex(integrity: string): string {
  if (!integrity.startsWith("sha256-")) fail(`${integrity}: not a sha256 integrity`);
  return Buffer.from(integrity.slice("sha256-".length), "base64").toString("hex");
}

/// The name and version of a module(...) call.
export function moduleCall(text: string, where: string): { name: string; version: string } {
  const call = /^module\(([^)]*)\)/m.exec(text)?.[1];
  const name = call && /\bname\s*=\s*"([^"]+)"/.exec(call)?.[1];
  const version = call && /\bversion\s*=\s*"([^"]+)"/.exec(call)?.[1];
  if (!name || !version) fail(`${where}: no module(name = ..., version = ...)`);
  return { name, version };
}

/// A source archive: one top-level directory, the module's root, with its
/// MODULE.bazel.
export function readArchive(file: string): Omit<Module, "source"> & { strip_prefix: string } {
  const tar = (args: string[]) => {
    const result = spawnSync("tar", args, { encoding: "utf8", maxBuffer: 1 << 28 });
    if (result.status !== 0) fail(`tar ${args.join(" ")}: ${result.stderr}`);
    return result.stdout;
  };
  const tops = new Set(tar(["-tf", file]).split("\n").filter(Boolean).map((entry) => entry.replace(/^\.\//, "").split("/")[0]));
  if (tops.size !== 1) fail(`${file}: ${tops.size} top-level entries, not one directory`);
  const [strip_prefix] = tops;
  const module = tar(["-xOf", file, `${strip_prefix}/MODULE.bazel`]);
  return { ...moduleCall(module, file), module, strip_prefix: strip_prefix! };
}

/// Every published version, name -> version -> its records.
export function readModules(): Map<string, Map<string, Module>> {
  const modules = new Map<string, Map<string, Module>>();
  if (!fs.existsSync(MODULES)) return modules;
  for (const name of fs.readdirSync(MODULES)) {
    const versions = new Map<string, Module>();
    for (const version of fs.readdirSync(path.join(MODULES, name))) {
      const dir = path.join(MODULES, name, version);
      versions.set(version, {
        name,
        version,
        module: fs.readFileSync(path.join(dir, "MODULE.bazel"), "utf8"),
        source: JSON.parse(fs.readFileSync(path.join(dir, "source.json"), "utf8")),
      });
    }
    modules.set(name, versions);
  }
  return modules;
}

/// Bazel's order of versions: dot-separated parts, numeric ones by value,
/// a prerelease (-...) before its release.
export function compareVersions(a: string, b: string): number {
  const [aRelease, aPre = ""] = a.split(/-(.*)/s);
  const [bRelease, bPre = ""] = b.split(/-(.*)/s);
  const parts = (v: string) => v.split(".");
  const [ap, bp] = [parts(aRelease!), parts(bRelease!)];
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const [x, y] = [ap[i], bp[i]];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const [nx, ny] = [/^\d+$/.test(x) ? Number(x) : NaN, /^\d+$/.test(y) ? Number(y) : NaN];
    const order = !isNaN(nx) && !isNaN(ny) ? nx - ny : !isNaN(nx) ? -1 : !isNaN(ny) ? 1 : x < y ? -1 : x > y ? 1 : 0;
    if (order) return order;
  }
  if (aPre === bPre) return 0;
  return !aPre ? 1 : !bPre ? -1 : aPre < bPre ? -1 : 1;
}

export function gh(args: string[], options: { allowFailure?: boolean } = {}): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  const ok = result.status === 0;
  if (!ok && !options.allowFailure) fail(`gh ${args.join(" ")}: ${result.stderr}`);
  return { ok, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/// Asset name -> sha256 of a release, or undefined when there is none.
export function releaseAssets(tag: string): Map<string, string> | undefined {
  const result = gh(["release", "view", tag, "-R", REPO, "--json", "assets"], { allowFailure: true });
  if (!result.ok) {
    if (/release not found/.test(result.stderr)) return undefined;
    fail(`gh release view ${tag}: ${result.stderr}`);
  }
  const assets: { name: string; digest?: string }[] = JSON.parse(result.stdout).assets;
  return new Map(assets.map((a) => [a.name, (a.digest ?? "").replace(/^sha256:/, "")]));
}
