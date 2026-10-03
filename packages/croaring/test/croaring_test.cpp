#include <roaring/roaring.hh>

int main() {
  roaring::Roaring bitmap;
  for (uint32_t i = 0; i < 1000; i += 3) bitmap.add(i);
  roaring::Roaring other{1, 2, 3, 999};
  bitmap |= other;
  bitmap.runOptimize();
  return bitmap.cardinality() == 336 && bitmap.contains(999) && !bitmap.contains(4) ? 0 : 1;
}
