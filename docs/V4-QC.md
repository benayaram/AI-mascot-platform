# BENAI V4 QC evidence

Verdict: **GO for an invited single-instance pilot of the verified workflows.** This is development-team testing, not independent certification or a zero-defect guarantee. **NO-GO for promising real-time photorealistic neural video on this CPU, perfect lip sync, or validated native-speaker Telugu recognition.**

## Checks

- Production frontend build passes; the institute/Remotion bundle is loaded only on its route. Production dependency audit reports zero known advisories at validation time.
- `npm test`: 49 passing unit/integration cases, eight model cases skipped by default. Includes fourteen V4 provider/privacy/document/lesson/API cases, actual text-PDF extraction, media normalization, invalid playlist rejection, atomic inventory refund, API-plan checks, tenant boundaries and private-document exclusion from public widgets.
- Browser journeys: existing twelve product journeys passed with microphone-fixture capture; two new institute/source/language journeys passed after correcting the test's player-button locator. The final full run passed all fourteen journeys, with no skipped browser cases. The tests use a real browser and local model requests. The failed locator run is not counted as a pass.
- Real-time local-model socket checks: five passing cases. Initial parallel execution reused the demo port and encountered a delayed first token/cascading socket failures; the test now uses a dedicated port and passes separately without competing model generation.
- Actual fast portrait API test passes, producing private H.264/AAC video. The aligned neural worker also produced the committed real sample. The complete 25 fps neural API check also passed: an actual 1.4397-second clip was rendered, persisted, downloaded privately and charged one video unit (181.746 seconds worker time).
- Native Mongo replica-set and S3-compatible storage suites: two passing cases. These use real local MongoDB and a local S3 fixture, not the owner's unconfigured Atlas/R2 accounts.
- Actual local lesson export, official codec probing, decoded-frame review, browser preview and native MP4 playback were exercised. The recording includes a second scene with an uploaded supporting video.
- Real offline Telugu TTS returned a WAV. Multilingual Whisper was actually executed and returned Telugu text, but its recognition of the robotic sample was poor. Do not count that as an intelligibility or accuracy pass.
- Google TTS/Gemini answer integrations are verified with request/response fixtures, including rate limits, encrypted tenant credentials and refunds. No real customer provider key was supplied; account/model acceptance, provider quotas and natural Telugu voice quality remain unverified.

## Measured local samples

Hardware: CPU only, five threads, approximately 33 GiB RAM. Short samples; no concurrency or latency SLA.

| Output                            | Media duration   | Worker/render time   | Actual format               |
| --------------------------------- | ---------------- | -------------------- | --------------------------- |
| Fast portrait                     | 1.2655 seconds   | 0.653 seconds        | H.264/AAC, 384×384, 24 fps  |
| Aligned neural portrait           | 1.2655 seconds   | 138.281 seconds      | H.264/AAC, 384×384, 25 fps  |
| Initial one-scene narrated lesson | 4.833 seconds    | 31.216 seconds total | H.264/AAC, 1280×720, 24 fps |
| Offline Telugu synthesis request  | 5.18 seconds WAV | 31 ms request time   | PCM WAV; robotic voice      |

MuseTalk now uses a training-aligned nose/chin crop, fixed audio context and 25 fps. Frame review shows mouth changes while preserving most facial detail. The model can still produce soft mouth patches, imperfect teeth, identity drift and imperfect speech alignment. No native-speaker or phoneme-level lip-sync certification was performed. Fast warping does not synthesize phonemes.

## Boundaries

GPU hardware, public hosting/domain, actual Stripe charging, public SMTP delivery, customer Atlas/R2 endpoints and real paid providers were not activated in this session. Edge returned 403 even after trusted-CA configuration; it stays experimental/off by default. Google/Gemini/HeyGen account costs and terms apply when selected. No acoustic full-duplex barge-in, distributed queue, complete school SIS/LMS or omni text-to-video model is claimed.

Sources are bounded lexical retrieval, so paraphrases and Telugu token matching may miss relevant passages. Source-only mode can refuse unsupported questions but does not guarantee that a small language model never hallucinates. Review teaching material before sharing. Local model weights and hosting consume RAM/disk/CPU even without subscription charges.

**72 automated cases passed across the executed suites:** 49 default cases, 14 browser journeys, five real-time cases, fast and neural API video checks, and two Mongo/S3 checks. The eight default model skips are reported separately; unchanged diffusion was not rerun in V4.

The [machine-readable sample metrics](v4-qc-metrics.json) and the 84-second screen recording include real outputs. The recording has an explanatory Piper voiceover, not captured browser audio.

See [V4 features and operating instructions](V4.md), [recording](demo/v4-walkthrough.mp4), [institute output](demo/v4-institute-lesson.mp4) and [neural sample](demo/v4-neural-portrait.mp4).
