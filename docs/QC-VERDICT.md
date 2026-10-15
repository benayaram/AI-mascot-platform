# BENAI V4 QC verdict

See [current V4 evidence, measurements and remaining limitations](V4-QC.md). V4 is an invited-pilot release, with working multilingual routing and lecture exports. CPU neural video remains slow; native-speaker Telugu recognition, actual provider accounts and public deployment are not certified.

The V3 evidence below is retained as historical validation; its 12 fps/neural timing and test totals describe the previous release.

---

# BENAI V3 QC verdict

Release `3.0.0-beta.1` on `feat/benai-v3-low-latency-byok`.

**GO for an invited single-instance pilot using the verified CPU workflows.** The V2 latency issue is addressed through a separate fast animation renderer, and the launch workflows below are now implemented. This is automated testing and manual self-review, not independent certification or a guarantee of zero defects.

**Public paid activation is conditional on actual deployment/account checks.** No GPU, provider subscriptions, Atlas account, public domain or payment account was supplied here. Working adapters and local tests cannot certify those absent services. Do not market realtime neural CPU video or proprietary reference-site parity.

## Executed release checks

| Suite                                        | Distinct passing cases | Evidence                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend/auth/ownership/billing regression    | 18                     | Existing account/CSRF/ownership/quota/key/widget/Stripe signature workflows                                                                                                                                                                                                                                                 |
| V3 provider/privacy/growth/backup acceptance | 15                     | Encrypted private keys, account-bound authentication, SSRF URL rejection, concurrent storage cap, three TTS request/response adapters, Gemini SSE socket chunks, failure refunds, verified GPU routing contract, HeyGen private MP4 contract, verification, templates/leads/referrals, restore integrity, recovery/deletion |
| Launch identity and SMTP                     | 2                      | Verification gate and real SMTP protocol delivery to a local test inbox                                                                                                                                                                                                                                                     |
| Native Mongo/S3 storage                      | 2                      | Actual replica-set persistence/restart/ciphertext/quotas and Mongo backup/restore; S3 private video/signing fixture                                                                                                                                                                                                         |
| Browser product journeys                     | 12                     | Eight existing product journeys plus settings/mobile GPU explanation, real local fact-grounded demo→lead→referral, verification/recovery, operations status                                                                                                                                                                 |
| Actual self-hosted model checks              | 8                      | Five real local WebSocket cases, diffusion PNG, neural MP4, fast animated MP4                                                                                                                                                                                                                                               |

**57 distinct automated cases passed across these suites.** `npm test` runs 35 cases and intentionally skips eight opt-in model cases; those eight were separately executed against actual local workers. Production build, formatting, Python/JS compilation and shell syntax checks completed. No customer paid-provider credentials were used during validation. The production dependency audit reported zero known vulnerabilities; that is not a security certification.

Provider/GPU fixtures prove request formats, ciphertext/account isolation, streaming handling, job persistence/private downloads, failures and routing. They do **not** prove a real provider accepts a customer’s key/model, a real GPU’s throughput, cloud SMTP deliverability, Atlas/R2 connectivity or real Stripe charging. The SMTP adapter exercised the actual SMTP protocol locally; browser identity tests consumed actual locally delivered capture links.

## Latency evidence

Hardware: CPU only, five threads and approximately 33 GiB RAM. Measurements are short functional samples, not load-test or latency guarantees. Detailed evidence is in [v3-qc-metrics.json](v3-qc-metrics.json).

A roughly **1.4-second fast CPU portrait** rendered in about **0.65–0.70 seconds**, around **1.05 seconds end to end** in the recorded sample. The generated H.264/AAC MP4 was private and playable, with 24 fps output and changing decoded video frame hashes. The worker uses a real landmark detector and audio-driven image warping. This is lightweight animation, not neural lip synthesis or phoneme-accurate mouth movement.

The neural CPU path produced approximately **1.44 seconds in 72.93 seconds of rendering** in the V3 sample. CPU MuseTalk remains slow. The product defaults to fast animation and lets users explicitly choose neural quality. A GPU selector is unavailable until a reachable worker reports CUDA support; unsupported switching fails before video quota reservation. CUDA installation/worker scripts and device routing exist, but actual GPU inference, VRAM requirements and latency are unverified.

Live local voice still uses turn-based Whisper → streamed Qwen → Piper → face mesh, with explicit interruption. Gemini 3.8 TTS supports progressive SSE audio playback after the text reply. This is not Gemini Live multimodal/full-duplex conversation. No automatic acoustic barge-in, voice cloning or 120 fps claim is made.

## V2 gaps closed in code

- Added default fast CPU exports, explicit neural quality, CPU/GPU selection, per-job device routing and measured render metadata.
- Added encrypted account-private provider credentials, safe summaries, selection/deletion, discovery and speech previews; Mongo ciphertext survives restart.
- Connected provider TTS to studio, REST, widgets and local exports, and HeyGen generation to private job/download persistence.
- Added SMTP verification/recovery, hashed expiring atomic tokens, verification gating and session/key revocation on reset.
- Added customer data export/deletion, unused portrait removal, bounded concurrent portrait inventory and lead/demo revocation.
- Added offline integrity-checked SQLite/Mongo backup restoration, readiness/monitor commands and admin operations status.
- Added fact-grounded business templates, opt-in public demos, consented private leads, referral attribution and measurable usage counts.
- Added privacy/terms notices and a budget-conscious customer acquisition plan.

During QC, fixed the fast encoder pipe stall, correct SQLite duplicate handling, streaming playback order, stale provider status, shared-IP read/mutation throttling, referral attribution after navigation, MIME decoding assertions, mobile/selector checks and backup manifest/preflight validation. All repaired flows were revalidated.

## Actual activation requirements and limits

Before public paid use, configure and test the real HTTPS host/domain, SMTP sender/inbox delivery, stable master-key secret, selected provider/model access, chosen-host restore and alerting, and Stripe test checkout/portal/public webhook. Test real Atlas/R2 accounts if selected. Complete business identity/support/jurisdiction/backup-retention details in the notices and obtain appropriate review. Local archives do not back up remote R2 objects.

Single-instance quotas/queues are implemented; distributed queue/rate limiting, multi-instance orchestration and paid-customer concurrency SLAs are not. A provider may charge an interrupted/failed request even when BENAI quota is refunded. HeyGen creation interrupted before external-ID persistence can require dashboard reconciliation. Protected backup hashes detect corruption, not malicious rewriting by someone who controls the archive. Production master-key rotation requires a deliberate migration; losing the key makes saved secrets unreadable.

No public deployment, ads, hiring, provider purchase or unsolicited outreach occurred. See [V3-FEATURES.md](V3-FEATURES.md), [V3-OPERATIONS.md](V3-OPERATIONS.md) and [GROWTH-PLAN.md](GROWTH-PLAN.md). The previous release report is preserved in [QC-V2.md](QC-V2.md).
