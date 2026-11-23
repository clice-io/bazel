#include <mimalloc.h>

#ifdef __APPLE__
#include <mach/mach.h>
#include <stdio.h>
#include <string.h>

/* What the kernel counts of this process: its physical footprint. */
static size_t footprint(void) {
  task_vm_info_data_t info;
  mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
  if (task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&info, &count) != KERN_SUCCESS) return 0;
  return (size_t)info.phys_footprint;
}

/* Pages mimalloc handed back inside segments it keeps, then used again,
   count in the footprint again (patches/0001): 1 GiB of 64 KiB blocks,
   every other 4 MiB of it freed, collected and allocated again. */
int main(void) {
  enum { N = 16384, SIZE = 64 * 1024, RUN = 64 };
  static void* p[N];
  for (int i = 0; i < N; i++) { p[i] = mi_malloc(SIZE); if (!p[i]) return 2; memset(p[i], 1, SIZE); }
  size_t in_use = footprint();
  for (int i = 0; i < N; i++) if ((i / RUN) % 2) mi_free(p[i]);
  mi_collect(true);
  size_t freed = footprint();
  for (int i = 0; i < N; i++) if ((i / RUN) % 2) { p[i] = mi_malloc(SIZE); if (!p[i]) return 2; memset(p[i], 1, SIZE); }
  size_t reused = footprint();
  printf("footprint: %zu MiB in use, %zu MiB freed, %zu MiB reused\n", in_use >> 20, freed >> 20, reused >> 20);
  return freed < in_use - in_use / 4 && reused > in_use - in_use / 10 ? 0 : 1;
}
#else
int main(void) { return 0; }
#endif
