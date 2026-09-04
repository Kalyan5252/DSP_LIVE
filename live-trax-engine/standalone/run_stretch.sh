#!/usr/bin/env bash
# Build and run the time-stretch demo.
#   ./run_stretch.sh IN.wav --orig 120 --target 100 --play
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d ../third_party/signalsmith-stretch ]; then
  echo "Signalsmith missing - run  bash ../fetch_deps.sh  first."; exit 1
fi
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release >/dev/null
cmake --build build --target stretch_demo
echo
./build/stretch_demo "$@"
