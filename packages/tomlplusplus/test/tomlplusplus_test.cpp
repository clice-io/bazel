#include <toml++/toml.hpp>

int main() {
  auto table = toml::parse("answer = 42\nname = \"tomlplusplus\"\n");
  return table["answer"].value_or(0) == 42 && table["name"].value_or(std::string_view{}) == "tomlplusplus" ? 0 : 1;
}
