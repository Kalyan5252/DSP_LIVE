# Build the standalone tempo test harness.
#   make            -> ./tempo_test
#   make clicks     -> generate synthetic known-BPM test WAVs into ./samples
#   make test       -> build + run against the synthetic WAVs (prints values)
#   make bench      -> build + SCORE against ground truth (prints pass/fail)
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

# Scored benchmark: known tempo AND known transient positions, so a change can
# be proven better or worse instead of eyeballed. Compare two builds with:
#   python3 bench.py ./tempo_test --vs /path/to/old_tempo_test
bench: tempo_test bench/truth.json
	python3 bench.py ./tempo_test

bench/truth.json: bench_gen.py
	python3 bench_gen.py

clean:
	rm -f tempo_test
	rm -rf samples bench

.PHONY: clicks test bench clean
