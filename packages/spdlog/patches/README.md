# 0001-bundled-fmt-includes-stdlib.patch

The fmt 11.2 that spdlog 1.15.3 bundles calls `malloc` and `free` in
format.h (`detail::allocator`) without including `<stdlib.h>`, which other
headers bring in only on some C libraries: with libc++ on MinGW the bundled
fmt does not compile. The patch includes it, as fmt 12 does.
