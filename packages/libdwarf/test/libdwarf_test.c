#include <libdwarf.h>
#include <stdio.h>

int main(int argc, char** argv) {
  (void)argc;
  Dwarf_Debug dbg = 0;
  Dwarf_Error error = 0;
  /* The test's own executable: it may or may not carry DWARF, but libdwarf
     must read it as an object file. */
  int status = dwarf_init_path(argv[0], 0, 0, DW_GROUPNUMBER_ANY, 0, 0, &dbg, &error);
  printf("libdwarf %s: dwarf_init_path %d\n", dwarf_package_version(), status);
  if (status == DW_DLV_OK) dwarf_finish(dbg);
  return status == DW_DLV_ERROR ? 1 : 0;
}
