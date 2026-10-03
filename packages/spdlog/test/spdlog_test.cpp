#include <spdlog/sinks/ringbuffer_sink.h>
#include <spdlog/spdlog.h>

int main() {
  auto sink = std::make_shared<spdlog::sinks::ringbuffer_sink_mt>(4);
  sink->set_pattern("%v");
  spdlog::logger logger("test", sink);
  logger.info("answer {}", 42);
  auto lines = sink->last_formatted();
  return lines.size() == 1 && lines[0].starts_with("answer 42") ? 0 : 1;
}
