#include <cpptrace/cpptrace.hpp>
#include <iostream>

[[gnu::noinline]] cpptrace::stacktrace here() { return cpptrace::generate_trace(); }

int main() {
  auto trace = here();
  trace.print();
  return trace.frames.empty() ? 1 : 0;
}
