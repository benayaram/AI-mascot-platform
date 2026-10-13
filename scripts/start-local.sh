#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BENAI_RUNTIME_DIR="${BENAI_RUNTIME_DIR:-/workspace/benai-runtime}"
export PIPER_MODEL="$BENAI_RUNTIME_DIR/models/piper/en_US-ljspeech-medium.onnx"
export PIPER_MALE_MODEL="$BENAI_RUNTIME_DIR/models/piper/en_US-bryce-medium.onnx"
export WHISPER_MODEL="$BENAI_RUNTIME_DIR/models/whisper"
"$BENAI_RUNTIME_DIR/llama/build/bin/llama-server" -m "${BENAI_CHAT_MODEL_PATH:-$BENAI_RUNTIME_DIR/models/qwen2.5-1.5b-instruct-q4_k_m.gguf}" --host 127.0.0.1 --port 8081 -t "${BENAI_AI_THREADS:-4}" -c 4096 --parallel 1 &
BENAI_LLM_PID=$!
"$BENAI_RUNTIME_DIR/venv/bin/python" scripts/speech_server.py &
BENAI_SPEECH_PID=$!
BENAI_IMAGE_PID=""
if [ -x "$BENAI_RUNTIME_DIR/image-venv/bin/python" ] && [ "${BENAI_SKIP_IMAGES:-0}" != 1 ]; then
  BENAI_IMAGE_MODEL="$BENAI_RUNTIME_DIR/models/tiny-sd" "$BENAI_RUNTIME_DIR/image-venv/bin/python" scripts/image_server.py &
  BENAI_IMAGE_PID=$!
fi
BENAI_PORTRAIT_PID=""
if [ -f "$BENAI_RUNTIME_DIR/models/musetalk/model.safetensors" ] && [ "${BENAI_SKIP_NEURAL:-0}" != 1 ]; then
  BENAI_RUNTIME_DIR="$BENAI_RUNTIME_DIR" "$BENAI_RUNTIME_DIR/image-venv/bin/python" scripts/portrait_server.py &
  BENAI_PORTRAIT_PID=$!
fi
cleanup() { kill "$BENAI_LLM_PID" "$BENAI_SPEECH_PID" ${BENAI_IMAGE_PID:+"$BENAI_IMAGE_PID"} ${BENAI_PORTRAIT_PID:+"$BENAI_PORTRAIT_PID"} 2>/dev/null || true; }
trap cleanup EXIT INT TERM
wait -n "$BENAI_LLM_PID" "$BENAI_SPEECH_PID" ${BENAI_IMAGE_PID:+"$BENAI_IMAGE_PID"} ${BENAI_PORTRAIT_PID:+"$BENAI_PORTRAIT_PID"}
