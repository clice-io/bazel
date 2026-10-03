#include <simdjson.h>

int main() {
  simdjson::ondemand::parser parser;
  auto json = simdjson::padded_string(std::string_view(R"({"answer": 42, "name": "simdjson"})"));
  auto doc = parser.iterate(json);
  int64_t answer = doc["answer"].get_int64();
  std::string_view name = doc["name"].get_string();
  return answer == 42 && name == "simdjson" ? 0 : 1;
}
