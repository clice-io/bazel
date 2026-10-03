#include <string.h>
#include <zstd.h>

int main(void) {
  const char text[] = "hello hello hello hello zstd";
  char packed[256], unpacked[256];
  size_t packed_size = ZSTD_compress(packed, sizeof packed, text, sizeof text, 19);
  if (ZSTD_isError(packed_size)) return 1;
  size_t unpacked_size = ZSTD_decompress(unpacked, sizeof unpacked, packed, packed_size);
  if (ZSTD_isError(unpacked_size)) return 2;
  return unpacked_size == sizeof text && memcmp(unpacked, text, sizeof text) == 0 ? 0 : 3;
}
