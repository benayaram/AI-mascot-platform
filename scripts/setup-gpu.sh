#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v nvidia-smi >/dev/null || { echo 'GPU setup requires an NVIDIA GPU and compatible installed driver. CPU fast exports work without it.' >&2; exit 1; }
nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
BENAI_RUNTIME_DIR="${BENAI_RUNTIME_DIR:-/workspace/benai-runtime}"
export BENAI_RUNTIME_DIR
python3 scripts/download-models.py v2-models-manifest.json
python3 scripts/download-models.py browser-model-manifest.json
if [ ! -x "$BENAI_RUNTIME_DIR/gpu-venv/bin/python" ]; then python3 -m venv "$BENAI_RUNTIME_DIR/gpu-venv"; fi
"$BENAI_RUNTIME_DIR/gpu-venv/bin/pip" install 'torch==2.9.1' --index-url https://download.pytorch.org/whl/cu128
"$BENAI_RUNTIME_DIR/gpu-venv/bin/pip" install -r scripts/image-requirements.txt
"$BENAI_RUNTIME_DIR/gpu-venv/bin/python" scripts/convert-portrait-weights.py
printf 'CUDA worker installed. Run npm run services:gpu and configure GPU_PORTRAIT_URL=http://127.0.0.1:8085 in the app environment.\n'
