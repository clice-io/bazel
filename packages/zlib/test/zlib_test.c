#include <string.h>
#include <zlib.h>

int main(void) {
  const char text[] = "hello hello hello hello zlib";
  unsigned char packed[128], unpacked[128];
  uLongf packed_size = sizeof packed, unpacked_size = sizeof unpacked;
  if (compress(packed, &packed_size, (const Bytef*)text, sizeof text) != Z_OK) return 1;
  if (uncompress(unpacked, &unpacked_size, packed, packed_size) != Z_OK) return 2;
  return unpacked_size == sizeof text && memcmp(unpacked, text, sizeof text) == 0 ? 0 : 3;
}
