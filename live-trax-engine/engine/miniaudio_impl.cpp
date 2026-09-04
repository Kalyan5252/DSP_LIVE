// The single translation unit that compiles miniaudio's implementation.
// Every other file only includes the declarations from "miniaudio.h".
//
// Keep this in exactly ONE .cpp file in your build, or you'll get duplicate
// symbol errors at link time.

#define MINIAUDIO_IMPLEMENTATION

// Trim the build: we only need decoding + playback devices, not the full
// engine's optional extras. (Comment these out if you later use more of
// miniaudio.) These must come before the include.
// #define MA_NO_ENCODING
// #define MA_NO_GENERATION

#include "miniaudio.h"
