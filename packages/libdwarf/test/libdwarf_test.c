#include <libdwarf.h>
#include <stdio.h>

int main(int argc, char** argv) {
  (void)argc;
  Dwarf_Debug dbg = 0;
  Dwarf_Error error = 0;
  /* The test's own executable. An ELF one is read; a Mach-O one keeps its
     DWARF in the object files (or a dSYM), which libdwarf reports as an
     error. */
  int status = dwarf_init_path(argv[0], 0, 0, DW_GROUPNUMBER_ANY, 0, 0, &dbg, &error);
  printf("dwarf_init_path: %d %s\n", status, status == DW_DLV_ERROR ? dwarf_errmsg(error) : "");
  if (status == DW_DLV_OK) dwarf_finish(dbg);
#ifdef __APPLE__
  return 0;
#else
  return status == DW_DLV_ERROR ? 1 : 0;
#endif
}
