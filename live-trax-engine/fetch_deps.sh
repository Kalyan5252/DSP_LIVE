#!/usr/bin/env bash
# Downloads the one external dependency: miniaudio.h (single public-domain header).
set -euo pipefail

DEST="engine/miniaudio.h"
URL="https://raw.githubusercontent.com/mackron/miniaudio/master/miniaudio.h"

if [ -f "$DEST" ]; then
  echo "engine/miniaudio.h already present — nothing to do."
  exit 0
fi

echo "Downloading miniaudio.h ..."
if command -v curl >/dev/null 2>&1; then
  curl -L "$URL" -o "$DEST"
elif command -v wget >/dev/null 2>&1; then
  wget -O "$DEST" "$URL"
else
  echo "Need curl or wget. Install one, or download manually:"
  echo "  $URL  ->  $DEST"
  exit 1
fi

# Remove the placeholder now that the real header exists.
rm -f engine/miniaudio.h.PLACEHOLDER
echo "Done: $DEST"
