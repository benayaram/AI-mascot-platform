# V3 local model attribution and commercial-use screening

| Component            | Included selection                     | Published terms/source                                                                                                                                                     |
| -------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat                 | Qwen2.5-1.5B-Instruct-GGUF             | Apache-2.0, [official Qwen repository](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF)                                                                             |
| Chat runtime         | llama.cpp b6800                        | MIT, [upstream](https://github.com/ggml-org/llama.cpp)                                                                                                                     |
| Recognition          | Whisper tiny.en through faster-whisper | MIT / published Apache-2.0 HF model metadata, [model](https://huggingface.co/Systran/faster-whisper-tiny.en)                                                               |
| Voice                | Piper LJSpeech medium                  | LJSpeech corpus is public domain; [official voice files](https://huggingface.co/rhasspy/piper-voices)                                                                      |
| Second voice         | Piper US Bryce medium                  | Publisher model card identifies public-domain data recorded by the speaker; [card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/bryce/medium/MODEL_CARD) |
| Speech engine        | Piper                                  | GPL-3.0, separate local process; [upstream](https://github.com/OHF-Voice/piper1-gpl)                                                                                       |
| Portrait images      | Segmind Tiny-SD                        | CreativeML Open RAIL-M; [model card](https://huggingface.co/segmind/tiny-sd)                                                                                               |
| Neural lips/video    | MuseTalk 1.5                           | MIT and publisher permission for commercial model use; [repository](https://github.com/TMElyralab/MuseTalk), [model license](licenses/MuseTalk.txt)                        |
| Video VAE            | stabilityai/sd-vae-ft-mse              | MIT in published model metadata and MuseTalk dependency license; [model](https://huggingface.co/stabilityai/sd-vae-ft-mse)                                                 |
| Video audio features | openai/whisper-tiny encoder            | Open weights, locally loaded safetensors; [model](https://huggingface.co/openai/whisper-tiny)                                                                              |
| Face detection/rig   | Google MediaPipe Face Landmarker       | Apache-2.0 project/tasks; [documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)                                                           |

The OpenAI name in the Whisper publisher/model path does **not** mean an OpenAI API is called. Local inference does not call those APIs. V3 optionally uses customer-owned Gemini/OpenAI/ElevenLabs/HeyGen credentials; external models and account licenses are not bundled open weights. MuseTalk preprocessing uses our MediaPipe crop, not the upstream DWpose/S3FD/face-parsing packages; those omitted detectors/weights are not downloaded. Model terms must still be followed when redistributing a deployment; this document records the selections and sources rather than offering legal advice.

The Piper Ryan voice was considered and excluded: its dataset model card says **CC BY-NC-SA 4.0**. Wav2Lip's research/non-commercial weights were not selected. Non-commercial example videos or portrait photos from the reference products are not used. BENAI's three realistic presets were generated locally and represent fictional people.

## Integrity and serialization

`scripts/models-manifest.json`, `image-manifest.json`, `v2-models-manifest.json` and `browser-model-manifest.json` pin artifact locations and checksums. Large HF weights were checked against publisher LFS SHA-256 metadata; small config files against Git blob hashes. The MediaPipe task file was verified against the official Google object MD5 header, then pinned with SHA-256. The runtime archive was checked against the official GitHub release digest.

MuseTalk and Tiny-SD tensor checkpoints are converted using explicit `torch.load(..., weights_only=True)` after upstream checksum verification. Running inference uses safetensors. Do not use unrestricted pickle loading, disable TLS checks, or replace expected hashes to get an installation to pass.

The models are installed outside Git. Preserve the third-party model/software notices when redistributing runtime files, including Piper's GPL obligations. FFmpeg licensing depends on the installed build. BENAI original application code/illustrations are MIT.
