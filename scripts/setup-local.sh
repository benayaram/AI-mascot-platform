#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BENAI_RUNTIME_DIR="${BENAI_RUNTIME_DIR:-/workspace/benai-runtime}"
export BENAI_RUNTIME_DIR
command -v ffmpeg >/dev/null || { echo 'Install FFmpeg before local video rendering.' >&2; exit 1; }
python3 scripts/download-models.py
python3 scripts/download-models.py v2-models-manifest.json
python3 scripts/download-models.py multilingual-manifest.json
python3 scripts/download-models.py browser-model-manifest.json
node scripts/prepare-browser-assets.js
bash scripts/setup-budget-speech.sh
mkdir -p "$BENAI_RUNTIME_DIR/llama"
if [ ! -x "$BENAI_RUNTIME_DIR/llama/build/bin/llama-server" ]; then
  unzip -q "$BENAI_RUNTIME_DIR/llama.zip" -d "$BENAI_RUNTIME_DIR/llama"
fi
if [ ! -x "$BENAI_RUNTIME_DIR/venv/bin/python" ]; then python3 -m venv "$BENAI_RUNTIME_DIR/venv"; fi
"$BENAI_RUNTIME_DIR/venv/bin/pip" install --cache-dir "$BENAI_RUNTIME_DIR/pip-cache" -r scripts/speech-requirements.txt
if [ "${BENAI_SKIP_IMAGES:-0}" != 1 ]; then
  python3 scripts/download-models.py image-manifest.json
  if [ ! -x "$BENAI_RUNTIME_DIR/image-venv/bin/python" ]; then python3 -m venv "$BENAI_RUNTIME_DIR/image-venv"; fi
  "$BENAI_RUNTIME_DIR/image-venv/bin/pip" install --cache-dir "$BENAI_RUNTIME_DIR/pip-cache" 'torch==2.9.1' --index-url https://download.pytorch.org/whl/cpu
  "$BENAI_RUNTIME_DIR/image-venv/bin/pip" install --cache-dir "$BENAI_RUNTIME_DIR/pip-cache" -r scripts/image-requirements.txt
  "$BENAI_RUNTIME_DIR/image-venv/bin/python" scripts/convert-image-weights.py
  "$BENAI_RUNTIME_DIR/image-venv/bin/python" scripts/convert-portrait-weights.py
fi
printf 'Local AI and speech installed. Run npm run services:local in a separate terminal.\n'
