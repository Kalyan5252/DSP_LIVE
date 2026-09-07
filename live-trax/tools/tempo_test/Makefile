# Build the standalone tempo test harness.
#   make            -> ./tempo_test
#   make clicks     -> generate synthetic known-BPM test WAVs into ./samples
#   make test       -> build + run against the synthetic WAVs
#   make clean
CXX      ?= clang++
CPPDIR    = ../../modules/live-trax-engine/ios/cpp
CXXFLAGS  = -std=c++17 -O2 -I$(CPPDIR)
LDFLAGS   = -lpthread -lm

tempo_test: tempo_test.cpp $(CPPDIR)/analysis_core.h $(CPPDIR)/vendor/miniaudio.h
	$(CXX) $(CXXFLAGS) tempo_test.cpp -o tempo_test $(LDFLAGS)

clicks:
	python3 make_clicks.py

test: tempo_test clicks
	./tempo_test samples/*.wav

clean:
	rm -f tempo_test
	rm -rf samples
