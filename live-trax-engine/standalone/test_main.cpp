// Standalone test harness for PadEngine.
//
// Build and run this FIRST, before touching React Native. If you hear your
// samples loop and stop on command from the terminal, the engine works — and
// every later problem is integration, not the engine.
//
// Usage:
//   ./padtest sample1.wav [sample2.wav ...]
//
// Loads each file onto a pad (looping), then gives you a tiny REPL:
//   0..9  -> toggle that pad
//   s     -> stop all
//   q     -> quit

#include "PadEngine.h"

#include <cstdio>
#include <iostream>
#include <string>

int main(int argc, char** argv) {
  if (argc < 2) {
    std::printf("Usage: %s sample1.wav [sample2.wav ...]\n", argv[0]);
    std::printf("Supported: WAV, MP3, FLAC (miniaudio's built-in decoders).\n");
    return 1;
  }

  livetrax::PadEngine engine;
  if (!engine.init()) {
    std::fprintf(stderr, "Failed to initialize audio device.\n");
    return 1;
  }

  int loaded = 0;
  for (int i = 1; i < argc && loaded < livetrax::kMaxPads; ++i, ++loaded) {
    bool ok = engine.loadPad(loaded, argv[i], /*loop=*/true);
    std::printf("pad %d  <-  %s   %s\n", loaded, argv[i], ok ? "OK" : "FAILED");
  }

  std::printf(
      "\nCommands:  [0-%d] toggle pad   s = stop all   q = quit\n> ",
      loaded - 1);
  std::fflush(stdout);

  std::string line;
  while (std::getline(std::cin, line)) {
    for (char c : line) {
      if (c == 'q') {
        engine.stopAll();
        engine.shutdown();
        std::printf("bye\n");
        return 0;
      } else if (c == 's') {
        engine.stopAll();
        std::printf("(stopped all)\n");
      } else if (c >= '0' && c <= '9') {
        int idx = c - '0';
        engine.trigger(idx);
        std::printf("pad %d -> %s\n", idx,
                    engine.isPlaying(idx) ? "playing" : "stopped");
      }
    }
    std::printf("> ");
    std::fflush(stdout);
  }

  engine.shutdown();
  return 0;
}
