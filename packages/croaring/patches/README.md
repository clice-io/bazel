# 0001-header-inline-gnu-inline-in-cxx.patch

CRoaring's headers define 49 functions `inline`, C99-style: one of the
library's C files gives each its external definition (`extern inline`). In
C++ an inline function is a COMDAT definition in every object that emits it,
which an ELF linker drops in favour of the C library's, and a COFF linker
(MinGW's lld) rejects next to it as a duplicate symbol. The patch defines
`CROARING_HEADER_INLINE` in portability.h, `inline __attribute__((gnu_inline))`
in C++ with GCC or clang and plain `inline` otherwise, and the headers use
it: C++ code then calls the library's definition instead of emitting its
own. clice linked with `-Wl,--allow-multiple-definition` until now.
