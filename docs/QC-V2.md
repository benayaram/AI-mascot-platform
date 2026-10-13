# BENAI V2 release QC verdict

Release candidate: **2.0.0-beta.1** on **feat/benai-v2-realistic-self-hosted**.

**GO: supervised, CPU-only pilot for live voice/portrait assistants, customer/admin workflows, widgets, APIs, and queued video exports.**

**NO-GO: unattended public paid launch, realtime neural talking-head video streaming on CPU, or an assertion of Mascotbot performance parity.** Those claims exceed the evidence or need the launch prerequisites listed below. This is automated testing and manual self-review, not independent external certification.

## Executed evidence

| Suite                                     | Executed outcome | What it demonstrates                                                                                                                                                                                 |
| ----------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend/auth/ownership/billing unit tests | 18 passed        | Password/session/CSRF/origin checks, customer isolation, private media/reuse restrictions, consent, quotas and concurrent avatar inventory, key revocation, widget revocation, signed billing events |
| Native database/object-storage tests      | 2 passed         | Real local Mongo replica-set persistence/transactions/concurrent quotas and avatar caps; private S3-compatible video upload/signed download fixture                                                  |
| Actual self-hosted realtime tests         | 5 passed         | Real token streaming and speech, audio recognition over our own socket, interruption/refund, origin/auth checks and revoked sessions                                                                 |
| Browser product tests                     | 8 passed         | Registration, real conversation/speech/transcription, illustrated editing, admin plans/API/widget, private MP4 playback, hands-free capture, realistic portraits and private-photo SDK widget        |
| Actual diffusion test                     | 1 passed         | Local weights produced an actual PNG through authenticated API; owner can retrieve it and usage is recorded                                                                                          |
| Actual neural export test                 | 1 passed         | MuseTalk produced a persisted, playable, private H.264/AAC talking-head MP4 through the backend                                                                                                      |

**35 distinct automated tests passed.** The standard `npm test` intentionally skips seven opt-in model cases; each of those seven was run separately against the real workers and passed. The build also completed. Model tests used no OpenAI/HeyGen API credentials or paid-provider responses.

Manual checks: two distinct Piper speakers generated different playable audio; three simultaneous short synthesis requests returned HTTP 200 through the bounded queue; all four model health endpoints responded; the neural frame was visually inspected for mouth movement and crop/blend artifacts; model/license selections and Git exclusions were reviewed. Public cloud account connectivity and real payment processing were not replaced with passing local fixtures.

## Actual measurements and practical limits

Hardware: five CPU threads, about 33 GiB RAM, no NVIDIA GPU. The full stack used roughly 8.5 GiB at an observed steady point; this is not a measured peak-memory guarantee. Detailed samples are in [v2-qc-metrics.json](v2-qc-metrics.json).

The final short-turn run included browser activity, so measurements should be read as small-sample functional timing, not an SLA. Three short typed turns and one short audio turn were recorded. First-token and audio-ready timing refer to backend delivery; microphone silence detection and browser buffering/playback add latency. Earlier idle samples were faster. Long answers and concurrent work can be slower.

Neural CPU rendering generated approximately 1.3–1.4 seconds of video in about 64–80 seconds across the observed samples. Output is 12 fps, with a six-second clip cap. A 12 fps output file does not imply 12 fps inference throughput. The interface labels this as a queued CPU export. Longer clips have not been benchmarked in this release.

Live portraits use a local MediaPipe landmark model and amplitude-driven textured face mesh, updated at approximately 30 Hz. This is a real local face rig but not neural-frame synthesis or phoneme-accurate visemes. MuseTalk produces actual neural lips for the queued export, with simple crop/blend compositing that can soften the lower face. Front-facing, clear, single-person portraits are the supported input; a poor crop or face pose may produce artifacts. Quality was manually inspected on a short synthetic example, not assessed by a human evaluation panel.

## Defects fixed during V2 QC

- Removed external OpenAI/HeyGen inference and realtime-token routes; selected local models do not require provider keys.
- Protected private portrait retrieval and cross-account image reuse; valid widgets have a revocable scoped image route.
- Added atomic avatar inventory limits for SQLite and MongoDB.
- Decode/normalize uploads and reject corrupt/oversized images before storing them.
- Added authenticated, exact-origin, CSRF-checked realtime turns and per-turn session revalidation.
- Cancel in-flight model requests and refund uncommitted/undelivered work when interrupted.
- Added a bounded speech wait queue for overlapping short requests.
- Prevented the chat's auto-scroll from moving the whole page; identified streaming/recognition/synthesis stages and displayed actual timings.
- Required safetensors for inference after checksum verification and restricted tensor-only conversion.
- Excluded the non-commercial Ryan voice and used the public-domain Bryce voice instead.

## Remaining launch gates and unverified claims

Public HTTPS hosting/domain, production secret management, tested backup restoration, monitoring/alerts, user account verification/recovery and business privacy/terms need completion before unattended public operation. Optional real Atlas/R2 accounts and a Stripe test checkout/portal/public webhook must be connected and tested if selected. No keys were requested for model inference.

The deployment is a single-instance CPU pilot. It has no distributed job queue, shared rate limiter or proven paid-customer concurrency SLA. Spoken input is English and turn-based; automatic full-duplex barge-in and voice cloning are not included. There is no verified 120 fps, large-scale load-test, GPU benchmark, or proprietary reference-site parity. No public launch, cloud account purchase, or staff hiring was performed.

The founder's rollout/staffing decision is documented in [STARTUP-PLAN.md](STARTUP-PLAN.md). Keep invitations and usage bounded, collect real pilot feedback, and reopen the release verdict when the actual hosting/account/scale prerequisites change.
