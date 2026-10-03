#include <mimalloc.h>
#include <string.h>

int main(void) {
  char* p = mi_malloc(100);
  if (!p) return 1;
  memset(p, 'x', 100);
  int ok = mi_usable_size(p) >= 100 && mi_version() >= 300;
  mi_free(p);
  return ok ? 0 : 2;
}
