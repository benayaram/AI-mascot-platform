# Model and tool attribution

Default chat: **Qwen2.5-0.5B-Instruct-GGUF**, published by Qwen; Apache-2.0. https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF

Inference runtime: **llama.cpp**, MIT; official release b6800. https://github.com/ggml-org/llama.cpp

Default voice: **Piper en_US-ljspeech-medium**, based on LJSpeech. Voice files and their configurations are pinned from the official Piper voice repository. The original LJSpeech corpus is public domain; review the selected voice model’s card when redistributing weights. https://huggingface.co/rhasspy/piper-voices

Speech engine: **Piper**, GPL-3.0. BENAI runs it as a separate local service; comply with Piper’s license when redistributing the program. https://github.com/OHF-Voice/piper1-gpl

Transcription: **Whisper tiny.en** via faster-whisper, MIT. https://huggingface.co/Systran/faster-whisper-tiny.en and https://github.com/SYSTRAN/faster-whisper

FFmpeg licensing depends on your installed build and enabled codecs. The system FFmpeg used for video rendering is not bundled into the repository.

`scripts/models-manifest.json` records pinned URLs and SHA-256 checksums. Weight hashes were verified against model publisher LFS metadata; small configuration files were verified against publisher Git blob IDs; the runtime archive was verified against the official GitHub release asset digest. Do not disable TLS or checksum verification to fix a download failure.

Models and runtimes are downloaded into your environment, not committed to GitHub. Original BENAI character illustrations are distributed with the repository under its MIT license. No reference-site assets are used.

Avatar images: **Segmind Tiny-SD**, CreativeML Open RAIL-M; distilled from Realistic Vision V4.0. Review its model license and use restrictions. https://huggingface.co/segmind/tiny-sd

Image model checkpoints are publisher-checksum-verified, then converted locally using PyTorch `weights_only=True` and saved as safetensors. The running image service requires safetensors; unrestricted pickle loading is not used.
