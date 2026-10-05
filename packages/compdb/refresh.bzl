"""compdb_refresh: the workspace's compile_commands.json, by bazel run.

The script builds the targets with the compdb aspect (compdb.bzl), which
compiles nothing, and merges the fragments the build event protocol names,
with the execution root as every entry's directory. Its arguments are the
build's options and targets (//... if none is given); Bazel is bazel from
PATH, or $COMPDB_BAZEL.
"""

_SH = """\
#!/bin/sh
# bazel run @compdb//:refresh [-- <bazel build options> <targets>]
set -e
cd "${{BUILD_WORKSPACE_DIRECTORY:?run it with bazel run @compdb//:refresh}}"
bazel=${{COMPDB_BAZEL:-bazel}}
targets=//...
for arg in "$@"; do
  case $arg in -*) ;; *) targets= ;; esac
done
events=$(mktemp "${{TMPDIR:-/tmp}}/compdb.XXXXXX")
trap 'rm -f "$events" "$events.files"' EXIT
"$bazel" build --aspects={aspect} --output_groups=compdb --build_event_json_file="$events" "$@" $targets
execroot=$("$bazel" info execution_root)
# The fragments' file URIs, decoded.
grep -o '"uri":"file://[^"]*\\.compdb\\.json"' "$events" |
  sed -e 's|^"uri":"file://||' -e 's|"$||' |
  LC_ALL=C awk '
    function hex(h,  n, i) {{ n = 0; h = toupper(h); for (i = 1; i <= 2; i++) n = n * 16 + index("0123456789ABCDEF", substr(h, i, 1)) - 1; return n }}
    {{ out = ""; s = $0; while ((i = index(s, "%")) > 0) {{ out = out substr(s, 1, i - 1) sprintf("%c", hex(substr(s, i + 1, 2))); s = substr(s, i + 3) }} print out s }}' |
  sort -u > "$events.files"
# The execution root as a JSON string, then as sed's replacement.
root=$(printf '%s' "$execroot" | sed -e 's/[\\\\"]/\\\\&/g' -e 's/[\\\\|&]/\\\\&/g')
{{
  printf '['
  sep=
  while IFS= read -r fragment; do
    body=$(sed -e '1s/^\\[//' -e '$s/\\]$//' "$fragment")
    if [ -n "$body" ]; then printf '%s%s' "$sep" "$body"; sep=,; fi
  done < "$events.files"
  printf ']\\n'
}} | sed "s|__COMPDB_EXECROOT__|$root|g" > compile_commands.json.tmp
mv -f compile_commands.json.tmp compile_commands.json
echo "compdb: $(grep -o '"directory":' compile_commands.json | wc -l | tr -d ' ') entries in $PWD/compile_commands.json" >&2
"""

_BAT = """\
@echo off\r
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0{ps1}" %*\r
exit /b %ERRORLEVEL%\r
"""

_PS1 = """\
# bazel run @compdb//:refresh [-- <bazel build options> <targets>]
$ErrorActionPreference = 'Stop'
if (-not $env:BUILD_WORKSPACE_DIRECTORY) {{
  [Console]::Error.WriteLine('run it with bazel run @compdb//:refresh')
  exit 2
}}
Set-Location -LiteralPath $env:BUILD_WORKSPACE_DIRECTORY
$bazel = if ($env:COMPDB_BAZEL) {{ $env:COMPDB_BAZEL }} else {{ 'bazel' }}
$targets = @('//...')
foreach ($arg in $args) {{ if (-not "$arg".StartsWith('-')) {{ $targets = @() }} }}
$events = [IO.Path]::GetTempFileName()
& $bazel build '--aspects={aspect}' --output_groups=compdb "--build_event_json_file=$events" @args @targets
if ($LASTEXITCODE) {{ Remove-Item -LiteralPath $events; exit $LASTEXITCODE }}
$execroot = (& $bazel info execution_root | Out-String).Trim()
if ($LASTEXITCODE) {{ Remove-Item -LiteralPath $events; exit $LASTEXITCODE }}
$files = Select-String -LiteralPath $events -Pattern '"uri":"file://([^"]*\\.compdb\\.json)"' -AllMatches |
  ForEach-Object {{ $_.Matches }} |
  ForEach-Object {{ [Uri]::UnescapeDataString($_.Groups[1].Value) -replace '^/([A-Za-z]:)', '$1' }} |
  Sort-Object -Unique
Remove-Item -LiteralPath $events
$bodies = foreach ($file in $files) {{
  $text = [IO.File]::ReadAllText($file).Trim()
  if ($text.Length -gt 2) {{ $text.Substring(1, $text.Length - 2) }}
}}
$root = $execroot.Replace('\\', '\\\\').Replace('"', '\\"')
$json = ('[' + ($bodies -join ',') + "]`n").Replace('__COMPDB_EXECROOT__', $root)
$out = Join-Path (Get-Location) 'compile_commands.json'
[IO.File]::WriteAllText("$out.tmp", $json, (New-Object Text.UTF8Encoding $false))
Move-Item -LiteralPath "$out.tmp" -Destination $out -Force
$count = ([regex]::Matches($json, '"directory":')).Count
[Console]::Error.WriteLine("compdb: $count entries in $out")
"""

def _compdb_refresh_impl(ctx):
    aspect = "%s%%compdb" % ctx.attr._aspect.label
    if ctx.target_platform_has_constraint(ctx.attr._windows[platform_common.ConstraintValueInfo]):
        ps1 = ctx.actions.declare_file(ctx.label.name + ".ps1")
        ctx.actions.write(ps1, _PS1.format(aspect = aspect))
        script = ctx.actions.declare_file(ctx.label.name + ".bat")
        ctx.actions.write(script, _BAT.format(ps1 = ps1.basename), is_executable = True)
        runfiles = ctx.runfiles(files = [ps1])
    else:
        script = ctx.actions.declare_file(ctx.label.name + ".sh")
        ctx.actions.write(script, _SH.format(aspect = aspect), is_executable = True)
        runfiles = ctx.runfiles()
    return [DefaultInfo(executable = script, files = depset([script]), runfiles = runfiles)]

compdb_refresh = rule(
    implementation = _compdb_refresh_impl,
    attrs = {
        "_aspect": attr.label(default = "//:compdb.bzl", allow_single_file = True),
        "_windows": attr.label(default = "@platforms//os:windows"),
    },
    executable = True,
    doc = "The workspace's compile_commands.json, from the compdb aspect, by bazel run.",
)
