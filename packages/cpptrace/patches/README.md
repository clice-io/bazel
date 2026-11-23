# 0001-dladdr1-on-glibc-alone.patch

cpptrace finds a frame's object with glibc's `dladdr1` where its CMake build
finds the function (Autoconfig.cmake), and BUILD.bazel names it for every
Linux target. musl has `dladdr` alone, so `src/binary/object.cpp` fails to
compile there (`RTLD_DL_LINKMAP` is undeclared). The patch drops
`CPPTRACE_HAS_DLADDR1` where the C library is not glibc, which leaves
cpptrace on `dladdr`, as its CMake build on musl does.
