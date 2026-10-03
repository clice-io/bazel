#include <uv.h>

static int fired;

static void on_timer(uv_timer_t* timer) {
  fired = 1;
  uv_close((uv_handle_t*)timer, NULL);
}

int main(void) {
  uv_loop_t loop;
  uv_timer_t timer;
  if (uv_loop_init(&loop) != 0) return 1;
  uv_timer_init(&loop, &timer);
  uv_timer_start(&timer, on_timer, 1, 0);
  uv_run(&loop, UV_RUN_DEFAULT);
  return fired && uv_loop_close(&loop) == 0 ? 0 : 2;
}
