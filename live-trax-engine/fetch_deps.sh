#!/usr/bin/env bash
# Downloads the external dependencies (kept out of git; restore anytime).
set -euo pipefail
cd "$(dirname "$0")"

# 1. miniaudio — playback, decoding, WAV encoding
DEST="engine/miniaudio.h"
if [ ! -f "$DEST" ]; then
  echo "Downloading miniaudio.h ..."
  URL="https://raw.githubusercontent.com/mackron/miniaudio/master/miniaudio.h"
  if command -v curl >/dev/null 2>&1; then curl -L "$URL" -o "$DEST"
  elif command -v wget >/dev/null 2>&1; then wget -O "$DEST" "$URL"
  else echo "Need curl or wget."; exit 1; fi
  rm -f engine/miniaudio.h.PLACEHOLDER
  echo "  -> $DEST"
else echo "miniaudio.h already present."; fi

# 2. Signalsmith Stretch (MIT) + its FFT dependency — time-stretching
mkdir -p third_party
if [ ! -d third_party/signalsmith-stretch ]; then
  echo "Cloning Signalsmith Stretch (MIT) ..."
  git clone --depth 1 https://github.com/Signalsmith-Audio/signalsmith-stretch.git third_party/signalsmith-stretch
else echo "signalsmith-stretch already present."; fi
if [ ! -d third_party/signalsmith-linear ]; then
  echo "Cloning Signalsmith Linear (FFT dependency) ..."
  git clone --depth 1 https://github.com/Signalsmith-Audio/linear.git third_party/signalsmith-linear
else echo "signalsmith-linear already present."; fi

echo "All dependencies ready."
