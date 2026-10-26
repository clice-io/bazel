#include <windows.h>
#include <detours.h>

#include <cstring>

// A function of the test's own, detoured, called, restored and called again.
static volatile int calls;

__attribute__((noinline)) static int answer() {
  calls = calls + 1;
  return 42;
}

static int (*original)() = answer;

static int detour() { return original() + 1; }

static bool attach(bool on) {
  if (DetourTransactionBegin() != NO_ERROR) return false;
  DetourUpdateThread(GetCurrentThread());
  auto pointer = reinterpret_cast<PVOID*>(&original);
  auto target = reinterpret_cast<PVOID>(detour);
  if ((on ? DetourAttach(pointer, target) : DetourDetach(pointer, target)) != NO_ERROR) return false;
  return DetourTransactionCommit() == NO_ERROR;
}

// A payload's identifier, as a program injecting a DLL gives it data.
static constexpr GUID payload_id = {0x6d2c4b1e, 0x3f0a, 0x4c8e, {0x9b, 0x51, 0x2e, 0x7d, 0x40, 0x13, 0xa6, 0xc9}};

int main() {
  // The walks of the address space from no module, whose start the patch
  // keeps defined: one finds the test's own, another the payload copied in.
  auto self = GetModuleHandleW(nullptr);
  bool found = false;
  for (HMODULE module = nullptr; (module = DetourEnumerateModules(module)) != nullptr;) {
    found = found || module == self;
  }
  if (!found) return 1;

  const char data[] = "catter";
  if (!DetourCopyPayloadToProcess(GetCurrentProcess(), payload_id, data, sizeof(data))) return 5;
  DWORD size = 0;
  auto payload = DetourFindPayloadEx(payload_id, &size);
  if (payload == nullptr || size != sizeof(data) || std::memcmp(payload, data, size) != 0) return 6;

  int (*volatile call)() = answer;
  if (!attach(true)) return 2;
  int detoured = call();
  if (!attach(false)) return 3;
  int restored = call();
  return detoured == 43 && restored == 42 && calls == 2 ? 0 : 4;
}
