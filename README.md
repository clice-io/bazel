# bazel

The Bazel registry for [clice](https://github.com/clice-io/clice): modules
we build ourselves and do not publish to the Bazel Central Registry,
[xclang](https://github.com/clice-io/xclang) and the third-party libraries
we package (packages/).

```
# .bazelrc
common --registry=https://bazel.clice.io/
common --registry=https://bcr.bazel.build/
```

```starlark
# MODULE.bazel
bazel_dep(name = "xclang", version = "23.1.2.5")
```

Naming registries replaces the default one, so the Bazel Central Registry
is named too, after this one.

## How it works

The registry is static files in the layout of the Bazel Central Registry,
no server:

- Every version of every module is one GitHub release, tagged
  `<name>-<version>`, holding its source archive: one directory, the
  module's root.
- `modules/<name>/<version>/MODULE.bazel` and `source.json` on `main` are
  the records of every version ever published. `gh-pages`, served at
  https://bazel.clice.io, holds them with each module's `metadata.json`
  (its versions) and `bazel_registry.json`.

A published version never changes: its archive, its MODULE.bazel and its
source.json stay as they are, as lock files record their digests.
Publishing a version again with another archive is refused; publish a new
version instead.

## Publishing

A repository publishes its modules with this repository's action and the
organization's `UPLOAD_BAZEL` token:

```yaml
- uses: clice-io/bazel@main
  with:
    archives: dist/*.tar.gz
    token: ${{ secrets.UPLOAD_BAZEL }}
```

Any repository of the organization can publish any number of modules;
every run gets its own pull request, so publishers never wait on or
overwrite each other. The action uploads each archive to its release and
commits its records to `modules/<name>/<version>/` through a pull request
that merges itself once `check` has passed: every archive must be in its
release with those bytes and hold that MODULE.bazel, and no published
record may change. On `main`, `pages` rebuilds the registry on gh-pages.

To take a version down, delete its archive from the release (or the
release itself), then remove its records in a pull request; `check`
refuses a removal while the archive is still there.

While the registry is experimental, `replace: true` replaces a version
published with another archive, through a pull request titled
`replace: ...`, the one kind `check` lets change records. Lock files that
recorded the old version need updating (`bazel mod deps
--lockfile_mode=update`).

## Packages

The third-party C and C++ libraries clice's projects use are packaged here,
each in `packages/<name>/`, and none is taken from the Bazel Central
Registry: we decide how each one is built, on every host xclang has,
Windows (MinGW) included.

```
packages/<name>/source.json   the library's release: url, sha256, strip_prefix
                              (none: a module of the package's files only)
packages/<name>/MODULE.bazel  the module: <name>, version <upstream>.clice.<n>
packages/<name>/BUILD.bazel   how it builds (and any other file of the module)
packages/<name>/patches/      our fixes to its source, each with what and why
packages/<name>/test/         a package that uses it, and check.ts if
                              it needs more than its tests
```

A module's source archive is the release's source, checked by its sha256
and patched, with its own Bazel files taken out and the package's put in
(`scripts/package.ts`). `packages` builds every package's archive, builds
and tests every package's `test/` with xclang on Linux, macOS and Windows,
x86-64 and arm64, and on `main` publishes the archives through the action:
an unchanged package gives the same bytes, so only new versions are
published. A version's `.clice.<n>` counts our changes to a release's
packaging, and keeps a version of ours apart from the Bazel Central
Registry's of the same release. Changing a package means a new `<n>`.

```
action.yml            the action
scripts/publish.ts    upload and write the records
scripts/check.ts      the check pull requests wait for
scripts/pages.ts      the registry on gh-pages
scripts/package.ts    the packages' archives and their tests' workspace
```

### compdb

`compdb`, a module of its own here, gives any Bazel workspace's C and C++
a `compile_commands.json`, whatever the toolchain:

```starlark
bazel_dep(name = "compdb", version = "0.1.0", dev_dependency = True)
```

```sh
bazel run @compdb//:refresh                         # //...
bazel run @compdb//:refresh -- --config=dev //src/...
```

The arguments are a `bazel build`'s, options and targets (`//...` if none
is given). It builds the targets with an aspect, `@compdb//:compdb.bzl%compdb`,
that compiles nothing and writes the compile commands of each target and of
its dependencies, other repositories' included, as rules_cc's actions have
them (C, C++, C++20 module interfaces and their importers, Objective-C),
and merges them into `compile_commands.json` in the workspace's directory.
Every entry's `directory` is the execution root (`bazel info
execution_root`), which its paths (`external/...`, `bazel-out/...`) are
relative to; being a build of the targets, the refresh leaves the execution
root with their repositories under `external/`, which `bazel run` itself
would not. Files a build generates, headers or an importer's `.modmap` and
module files, exist once one has made them; a tool that scans the modules
itself, as clice does, needs none. Bazel is `bazel` from `PATH`, or
`$COMPDB_BAZEL`; its startup options come from the `.bazelrc` files.
