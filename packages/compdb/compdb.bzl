"""The compdb aspect: the compile commands of a target and of what it
depends on, as rules_cc's actions have them (refresh.bzl merges them
into compile_commands.json).

    bazel build --aspects=@compdb//:compdb.bzl%compdb --output_groups=compdb <targets>

builds nothing but a <target>.compdb.json per target that compiles C or
C++: a JSON array of compile_commands.json entries whose directory is
__COMPDB_EXECROOT__, the execution root, which their paths (external/...,
bazel-out/...) are relative to. Being a build of the targets, it leaves the
execution root with their repositories under external/.
"""

CompdbInfo = provider(
    doc = "The compile commands of a target and of its dependencies.",
    fields = {"fragments": "depset of <target>.compdb.json files"},
)

# rules_cc's compiles of C, C++ (C++20 module interfaces too) and
# Objective-C.
_MNEMONICS = ["CppCompile", "ObjcCompile"]

# A source file by its suffix, where the command line does not say which
# argument it is.
_SOURCES = [
    ".c",
    ".cc",
    ".cpp",
    ".cxx",
    ".c++",
    ".C",
    ".cu",
    ".m",
    ".mm",
    ".cppm",
    ".ccm",
    ".cxxm",
    ".c++m",
    ".ixx",
    ".mpp",
]

def _after(argv, flags):
    """The argument after the first of flags, or None."""
    for i in range(len(argv) - 1):
        if argv[i] in flags:
            return argv[i + 1]
    return None

def _source(argv):
    source = _after(argv, ["-c", "/c"])
    if source:
        return source
    for arg in argv[1:]:
        for suffix in _SOURCES:
            if arg.endswith(suffix) and not arg.startswith("-"):
                return arg
    return None

def _output(argv):
    output = _after(argv, ["-o"])
    if output:
        return output
    for arg in argv:
        if arg.startswith("/Fo"):
            return arg[3:]
    return None

def _compdb_impl(target, ctx):
    # One entry per source: a library compiled both as position-independent
    # code and not (-c opt on Linux) has the latter's.
    entries = {}
    for action in target.actions:
        if action.mnemonic not in _MNEMONICS or not action.argv:
            continue
        source = _source(action.argv)
        if not source:
            continue
        entry = {
            "arguments": action.argv,
            "directory": "__COMPDB_EXECROOT__",
            "file": source,
        }
        output = _output(action.argv)
        if output:
            entry["output"] = output
        if source not in entries or ".pic." in entries[source].get("output", ""):
            entries[source] = entry
    direct = []
    if entries:
        fragment = ctx.actions.declare_file(ctx.label.name + ".compdb.json")
        ctx.actions.write(fragment, json.encode(entries.values()) + "\n")
        direct.append(fragment)
    fragments = depset(direct, transitive = [
        dep[CompdbInfo].fragments
        for attr in ["deps", "implementation_deps"]
        for dep in getattr(ctx.rule.attr, attr, [])
        if type(dep) == "Target" and CompdbInfo in dep
    ])
    return [
        CompdbInfo(fragments = fragments),
        OutputGroupInfo(compdb = fragments),
    ]

compdb = aspect(
    implementation = _compdb_impl,
    attr_aspects = ["deps", "implementation_deps"],
    doc = "Every compile command of the targets and of their dependencies, as <target>.compdb.json files (output group compdb).",
)
