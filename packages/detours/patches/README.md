# 0001-module-walk-null-pointer-arithmetic.patch

`DetourEnumerateModules` (modules.cpp) and `EnumerateModulesInProcess`
(creatwth.cpp) start their walk of the address space at
`(PBYTE)hModuleLast + 64K`, which for the first module, `hModuleLast ==
NULL`, is arithmetic on a null pointer: undefined behavior, from which
clang concludes the code unreachable where it inlines the first call, as
at `-O3`, and deletes the bodies of `DetourUpdateProcessWithDll` and
`DetourFindPayloadEx`. MSVC compiles it as written. The patch does the
arithmetic on `ULONG_PTR`.
