/// mimalloc with --@mimalloc//:override=true, in the tests' workspace after
/// the tests (packages.yml runs every <package>/check.ts there): override_test
/// finds malloc's blocks in mimalloc's heap on Linux and macOS, and outside it
/// on Windows, where the override does nothing.

import { spawnSync } from "node:child_process";
import fs from "node:fs";

const windows = process.platform === "win32";

// Windows: packages.yml's startup options, given on its command lines, as
// the workspace's own, unless another check has added them.
if (windows && !fs.readFileSync(".bazelrc", "utf8").includes("--output_user_root")) {
  fs.appendFileSync(".bazelrc", "\nstartup --output_user_root=C:/b\nstartup --windows_enable_symlinks\n");
}

const args = ["test", "--@mimalloc//:override=true", "//mimalloc:override_test"];
console.log(`+ bazel ${args.join(" ")}`);
const result = spawnSync("bazel", args, { shell: windows, stdio: ["ignore", "inherit", "inherit"] });
if (result.status !== 0) {
  console.error("FAILED: malloc with the override is not where the platform puts it");
  process.exit(1);
}
console.log("ok: malloc with the override is mimalloc's on Linux and macOS, the C runtime's on Windows");
