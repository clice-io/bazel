#include <MinHook.h>

// A function of the test's own, long enough for the jump MinHook writes over
// its start: hooked, called, unhooked and called again.
static volatile int calls;

__attribute__((noinline)) static int answer(void) {
  calls++;
  return 42;
}

static int (*original)(void);

static int detour(void) { return original() + 1; }

int main(void) {
  int (*volatile call)(void) = answer;
  if (MH_Initialize() != MH_OK) return 1;
  if (MH_CreateHook((LPVOID)answer, (LPVOID)detour, (LPVOID*)&original) != MH_OK) return 2;
  if (MH_EnableHook((LPVOID)answer) != MH_OK) return 3;
  int hooked = call();
  if (MH_DisableHook((LPVOID)answer) != MH_OK) return 4;
  int unhooked = call();
  if (MH_Uninitialize() != MH_OK) return 5;
  return hooked == 43 && unhooked == 42 && calls == 2 ? 0 : 6;
}
