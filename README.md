# bazel

The Bazel registry for [clice](https://github.com/clice-io/clice): modules
we build ourselves and do not publish to the Bazel Central Registry,
starting with [xclang](https://github.com/clice-io/xclang).

```
# .bazelrc
common --registry=https://bazel.clice.io/
common --registry=https://bcr.bazel.build/
```

```starlark
# MODULE.bazel
bazel_dep(name = "xclang", version = "23.1.2.4")
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

```
action.yml            the action
scripts/publish.ts    upload and write the records
scripts/check.ts      the check pull requests wait for
scripts/pages.ts      the registry on gh-pages
```
