# 0001-macos-reuse-counts-in-footprint.patch

On macOS mimalloc 2 hands the pages of a segment it keeps back to the kernel
with `MADV_FREE_REUSABLE`, which takes them out of the process's footprint,
and in a release build leaves them committed: when it uses them again it
calls nothing, and the kernel, which counts a reusable page again only after
`MADV_FREE_REUSE`, leaves them out of the footprint while they are in use. A
program that holds 1 GiB this way shows about half of it (test/footprint_test.c),
as libmalloc's reuse does; a program that sizes its work by its footprint
(clice's worker scheduler) takes on too much. The patch has the decommit ask
for a recommit, as debug builds already do, and the recommit on macOS tell the
kernel `MADV_FREE_REUSE`, as mimalloc 3 does when it reuses memory.
