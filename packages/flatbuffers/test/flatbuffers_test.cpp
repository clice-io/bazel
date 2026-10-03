#include <flatbuffers/flexbuffers.h>

int main() {
  flexbuffers::Builder builder;
  builder.Map([&] {
    builder.Int("answer", 42);
    builder.String("name", "flatbuffers");
  });
  builder.Finish();
  auto map = flexbuffers::GetRoot(builder.GetBuffer()).AsMap();
  return map["answer"].AsInt64() == 42 && map["name"].AsString().str() == "flatbuffers" ? 0 : 1;
}
