// ---------------------------------------------------------------------------
// Standalone tempo / onset test harness.
// Runs the SAME analysis_core.h the app uses, on real audio files, on your
// laptop — no Xcode, no device, no app rebuild.
//
//   make            # build ./tempo_test
//   ./tempo_test loop1.wav loop2.mp3 ...
//
// Decoding uses miniaudio (WAV / MP3 / FLAC built in). MA_NO_DEVICE_IO strips
// all the audio-device backends so it links with no OS frameworks and builds
// the same on macOS and Linux.
// ---------------------------------------------------------------------------
#define MA_NO_DEVICE_IO
#define MA_NO_ENGINE
#define MA_NO_GENERATION
#define MINIAUDIO_IMPLEMENTATION
#include "vendor/miniaudio.h"
#include "analysis_core.h"

#include <cstdio>
#include <vector>
#include <string>

static bool decodeMono(const char* path, std::vector<float>& mono, int& sr) {
  ma_decoder_config dc = ma_decoder_config_init(ma_format_f32, 1, 0); // force mono
  ma_decoder dec;
  if (ma_decoder_init_file(path, &dc, &dec) != MA_SUCCESS) return false;
  sr = (int)dec.outputSampleRate;
  ma_uint64 total = 0;
  ma_decoder_get_length_in_pcm_frames(&dec, &total);
  mono.assign((size_t)total, 0.f);
  ma_uint64 read = 0;
  ma_decoder_read_pcm_frames(&dec, mono.data(), total, &read);
  mono.resize((size_t)read);
  ma_decoder_uninit(&dec);
  return read > 0;
}

int main(int argc, char** argv) {
  if (argc < 2) {
    printf("usage: %s <audiofile> [more files ...]\n", argv[0]);
    return 1;
  }
  for (int i = 1; i < argc; ++i) {
    std::vector<float> mono; int sr = 0;
    if (!decodeMono(argv[i], mono, sr)) {
      printf("---- %s\n  DECODE FAILED (unsupported format or missing file)\n", argv[i]);
      continue;
    }
    livetrax::TempoAnalysis A = livetrax::analyzeMono(mono.data(), mono.size(), sr);
    printf("---- %s\n", argv[i]);
    printf("  sampleRate : %d Hz\n", A.sampleRate);
    printf("  duration   : %.3f s\n", A.durationSec);
    printf("  BPM        : %.2f   (beats = %ld)\n", A.bpm, A.beats);
    printf("  beatOffset : %.4f\n", A.beatOffset);
    printf("  onsets(%zu) : ", A.onsets.size());
    for (size_t k = 0; k < A.onsets.size() && k < 32; ++k) printf("%.3f ", A.onsets[k]);
    if (A.onsets.size() > 32) printf("... (+%zu more)", A.onsets.size() - 32);
    printf("\n\n");
  }
  return 0;
}
