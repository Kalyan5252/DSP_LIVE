#!/usr/bin/env bash
# Convenience: configure, build, and run the standalone engine test.
#   ./build_and_run.sh path/to/loop1.wav path/to/loop2.wav
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f ../engine/miniaudio.h ]; then
  echo "engine/miniaudio.h missing. Run  bash ../fetch_deps.sh  first."
  exit 1
fi

cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build

echo
echo "Running padtest — press a pad number to play, s to stop all, q to quit."
echo
./build/padtest "$@"
