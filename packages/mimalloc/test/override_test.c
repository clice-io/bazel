#include <mimalloc.h>
#include <stdlib.h>

/* Built with --@mimalloc//:override=true (check.ts): malloc is mimalloc's on
   Linux and macOS, the C runtime's on Windows, where the override does
   nothing. */
int main(void) {
  void* p = malloc(64);
  if (!p) return 1;
  int ours = mi_is_in_heap_region(p);
  free(p);
#ifdef _WIN32
  return ours ? 2 : 0;
#else
  return ours ? 0 : 2;
#endif
}
