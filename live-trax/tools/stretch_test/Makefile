# Build the standalone time-stretch harness.
#   make            -> ./stretch_test
#   make demo       -> build + run against the tempo_test benchmark loops
#   make listen     -> same, but also write stretched WAVs into ./out
#   make clean
CXX      ?= clang++
CPPDIR    = ../../modules/live-trax-engine/ios/cpp
BENCH     = ../tempo_test/bench
CXXFLAGS  = -std=c++17 -O2 -I$(CPPDIR) -Ivendor
LDFLAGS   = -lpthread -lm

stretch_test: stretch_test.cpp $(CPPDIR)/analysis_core.h vendor/miniaudio.h vendor/signalsmith-stretch.h
	$(CXX) $(CXXFLAGS) stretch_test.cpp -o stretch_test $(LDFLAGS)

# The tempo_test bench loops double as stretch material: known tempo, known
# transient positions, and a mix of percussive and sustained content.
$(BENCH)/truth.json:
	$(MAKE) -C ../tempo_test bench/truth.json

demo: stretch_test $(BENCH)/truth.json
	./stretch_test $(BENCH)/four_120.wav $(BENCH)/break_128.wav $(BENCH)/pad_128.wav

listen: stretch_test $(BENCH)/truth.json
	mkdir -p out
	./stretch_test --write out $(BENCH)/four_120.wav $(BENCH)/pad_128.wav

clean:
	rm -f stretch_test
	rm -rf out

.PHONY: demo listen clean
