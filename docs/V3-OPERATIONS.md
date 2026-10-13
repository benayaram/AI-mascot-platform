# V3 setup and operations

## CPU and GPU workers

Keep the tested CPU installation: `npm ci`, `npm run setup:local`, `npm run services:local`, `npm run build`, `npm start`. Preserve `.env`. Local portrait worker 8084 exposes `/render-fast` and `/render` and reports supported devices through `/health`.

CPU fast exports are image animation, capped at 60 seconds and 24 fps. Neural CPU exports are capped at six seconds and 12 fps. The CPU defaults deliberately keep CUDA disabled on that worker. Selecting GPU never silently falls back to CPU.

On a Linux machine with an NVIDIA GPU and compatible CUDA 12.8 driver, run `npm run setup:gpu`, then `npm run services:gpu`. This uses a separate CUDA PyTorch environment and starts a loopback-only portrait worker on 8085. Set `GPU_PORTRAIT_URL=http://127.0.0.1:8085` on the application. For a separate GPU host, use a private authenticated network or SSH tunnel; do not expose the unauthenticated worker publicly. Install/provision scripts are supplied, but no GPU exists here and CUDA inference/VRAM/latency were not benchmarked.

Customers see GPU mode only as available after a worker reports CUDA support. Each neural job includes its requested compute mode. The worker moves inference models to that device under its render lock. GPU neural output is 25 fps with a 30-second clip cap; output frame rate is not a throughput claim.

## Customer provider credentials

Customers use **AI & compute** to save their own keys, test discovery, choose models/voices/avatar IDs, select providers and preview speech. Requests go through fixed provider hosts on the backend. Arbitrary customer endpoint URLs are not accepted. Model names come from documented supported APIs; connection discovery and a generation preview are separate checks.

Keys are encrypted using AES-256-GCM with a random nonce and authenticated account/provider identity before database insertion. With `MONGODB_URI`, ciphertext is stored in the selected native MongoDB database and is compatible with Atlas. Without that configuration, encrypted SQLite storage remains available. Administrators cannot retrieve plaintext via settings or export APIs.

For production, securely supply `BYOK_MASTER_KEY`: base64 encoding of 32 cryptographically random bytes. Preserve it across replicas, restarts and restores. Do not put it in Git or expose it to the browser. Changing or losing it without a deliberate key migration makes saved customer credentials unreadable. Development auto-creates `.data/.provider-master-key` with mode 0600. Customers can rotate their own provider key by saving a replacement, or delete it; deletion resets selected providers to local.

Gemini 3.8 uses the documented `/v1beta/interactions` speech endpoint and SSE PCM chunks for studio playback. REST TTS and exports return complete WAV. The local Qwen model still generates conversation text; Gemini TTS does not replace it with Gemini Live. OpenAI uses `/v1/audio/speech`; ElevenLabs uses its voice-specific TTS endpoint; HeyGen uses video generation/status plus private MP4 storage. Provider error bodies and authorization headers are not returned to customers. Interrupted requests may still incur upstream charges.

HeyGen jobs persist the external job ID for restart polling. A crash between provider acceptance and local ID persistence may need manual provider reconciliation. Do not blindly retry unknown jobs. Download hosts are restricted, redirects are rejected, and media is capped at 100 MB. Only the operator may extend `HEYGEN_MEDIA_HOSTS` after verifying an actual provider media hostname.

## Production mail and identity

Production startup requires HTTPS `APP_URL`, `BYOK_MASTER_KEY`, `SMTP_HOST` and `MAIL_FROM`. Configure `SMTP_PORT` (usually 587), `SMTP_SECURE` (true for implicit TLS, usually port 465), and SMTP username/password if required. STARTTLS is mandatory for production when implicit TLS is not selected. Configure SPF/DKIM and test delivery to real inboxes before public launch.

Registration sends a one-use verification link. Reset links expire after 30 minutes; verification links after 24 hours. Only token hashes are stored. Reset consumes the token atomically and revokes sessions/integration keys. Unknown and known email reset requests have the same success response. Verification gates production compute/payment/public-demo use; `REQUIRE_VERIFIED_EMAIL=true` enables that gate in a private deployment as well.

`MAIL_CAPTURE_DIR` is a development/test-only file inbox; production ignores it. It is not real email delivery. No default administrator credentials are supplied. Existing V2 users must verify before production use. Securely bootstrapped administrators can configure the service; publishing a demo still requires a verified email.

## Backup and restoration

Use a single app instance. Stop the application before taking/restoring a backup; the CLI checks the configured application health URL and refuses a known running app. Keep other writers stopped too. This is an offline procedure, not a distributed online backup coordinator.

```bash
npm run backup -- /workspace/BENAI-backups/2026-10-13
npm run backup:verify -- /workspace/BENAI-backups/2026-10-13
# Point DATA_DIR/MONGODB_DB at a NEW empty restore destination before running:
npm run backup:restore -- /workspace/BENAI-backups/2026-10-13 --confirm-restore=BENAI
```

The private backup contains logical database records/usage, local portrait/video files and the development encryption key when present. Production environment secrets are not exported; supply the original master key separately. Mongo uses a snapshot transaction and requires a replica set. Both native Mongo and SQLite restoration into an empty destination were exercised. Existing destinations are refused. File hashes detect accidental corruption; they do not authenticate a backup against an attacker who controls both files and manifest. Files/paths are checked; symlinks are refused. Protect and encrypt backups before moving them off-host.

A local backup does not copy remote R2 objects. Configure and test R2 retention/backup separately if selected. A restored job may still refer to an R2 key. Do not claim full disaster recovery from the local archive alone. Account deletion removes active database records and owned local/configured R2 media; old backups must expire under the operator’s disclosed retention policy.

## Monitoring and capacity

`/api/ready` returns 200 only when local chat and speech probes are ready, otherwise 503; it exposes no worker URLs/secrets. `/api/health` reports web/database startup, while authenticated `/api/models` and the admin operations page give fuller service status. Run `npm run monitor` under your existing scheduler/uptime service; its exit code is nonzero when readiness fails. Configure actual alerts in your chosen monitoring service and verify them. No unsolicited notification was sent during development.

One local video job per app process, one chat inference slot, bounded speech queuing and monthly quotas keep costs bounded. BYOK moves provider usage charges to the customer’s provider account, not to BENAI. It does not remove infrastructure/support costs. Multi-instance deployment needs a shared queue/rate limiter/media store; this release does not supply or claim a distributed concurrency SLA.

Before taking recurring payments, validate the actual HTTPS host, SMTP delivery, restore procedure, provider model access and Stripe test checkout/portal/webhook. Fill business/support/jurisdiction/retention details in the privacy and terms pages, have them reviewed, and benchmark the intended workload. Local tests cannot certify an unconfigured public deployment.

## Provider references reviewed

- [Google Gemini speech generation, including 3.8 Flash TTS and SSE PCM](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Google Live API, a separate conversation interface](https://ai.google.dev/gemini-api/docs/live-api)
- [OpenAI create speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create)
- [ElevenLabs text-to-speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- [HeyGen video generation reference](https://docs.heygen.com/reference/create-an-avatar-video-v2) and [video status](https://docs.heygen.com/reference/video-status): documentation access was blocked here; the standard v2 generation/v1 status contract was exercised against a local fixture and still requires validation with a real customer account.
