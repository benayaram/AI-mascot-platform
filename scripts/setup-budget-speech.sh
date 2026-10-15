#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BENAI_RUNTIME_DIR="${BENAI_RUNTIME_DIR:-/workspace/benai-runtime}"
export BENAI_RUNTIME_DIR
if command -v espeak-ng >/dev/null; then
  echo 'Using installed eSpeak NG.'
elif [ "$(uname -s)" = Linux ] && [ "$(uname -m)" = x86_64 ]; then
  python3 scripts/download-models.py espeak-manifest.json
  mkdir -p "$BENAI_RUNTIME_DIR/espeak"
  for package in "$BENAI_RUNTIME_DIR"/espeak-packages/*.deb; do dpkg-deb -x "$package" "$BENAI_RUNTIME_DIR/espeak"; done
  echo 'Pinned Debian eSpeak NG extracted privately. Requires glibc >=2.34; see docs/V4.md.'
else
  echo 'Install espeak-ng using your operating system package manager for offline multilingual speech.' >&2
  exit 1
fi
