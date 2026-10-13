#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BENAI_RUNTIME_DIR="${BENAI_RUNTIME_DIR:-/workspace/benai-runtime}"
export BENAI_RUNTIME_DIR
export BENAI_DEVICE=cuda
export PORTRAIT_PORT="${PORTRAIT_PORT:-8085}"
exec "$BENAI_RUNTIME_DIR/gpu-venv/bin/python" scripts/portrait_server.py
