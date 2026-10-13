# Deploying the CPU pilot

Use a persistent Linux x86-64 machine with Node 24, Python 3.12, FFmpeg, curl and unzip. The full stack was tested on roughly 32 GiB RAM / five CPU threads. A 16+ GB RAM / 20+ GB disk planning baseline must be benchmarked on your own host; it is not a tested minimum or a throughput guarantee. No hosting account/domain has been provisioned.

1. Check out the V3 branch/tag. Install with `npm ci`, preserve/create `.env`, and run `npm run setup:local`. Downloads use pinned checksums and TLS.
2. Run `npm run services:local` under a supervisor. Chat 8081, speech 8082, images 8083 and portrait video 8084 stay bound to loopback. If a supervised worker exits, the script stops the others; have your supervisor restart it.
3. Run `npm run build` then `npm start` under the supervisor. Point an HTTPS reverse proxy at port 3001 and forward WebSocket upgrades for `/api/realtime`. Do not expose the model ports.
4. Supply `BYOK_MASTER_KEY`, SMTP and `MAIL_FROM` as documented in [V3-OPERATIONS.md](V3-OPERATIONS.md). Set `NODE_ENV=production`, `APP_URL=https://your-domain`, and `DEMO_MODE=false`. Set `TRUST_PROXY=1` only behind one explicitly trusted proxy. `.env` and credentials do not belong in Git or browser code.
5. Register/promote the owner's account with the administrator CLI. Review customer plan limits and keep the initial pilot invitation-only.
6. Persist/back up `.data` and model/runtime directories. If using MongoDB, use actual Atlas credentials/native TLS and verify the access list. Switching backends does not migrate accounts. If using R2, grant private bucket-scoped credentials and verify uploads and expiring downloads; avatar files still use the app volume.
7. Only enable charging after Stripe test-mode checkout, customer portal, and real public signature-verified webhook delivery pass. AI model inference does not require Stripe or any paid AI keys.
8. Run the full release checks on your chosen HTTPS origin: login, actual voice turn, microphone permission, cancellation, private media, widget, admin plan grant, video render/download and backup restore.

## Readiness and capacity

`/api/health` proves web/database startup. Authenticated `/api/models` probes configured worker health. A port/PID or a configured URL alone is not functional readiness. Run `npm run test:realtime` and `npm run test:neural` against the actual workers for inference checks.

One chat slot, one video render per process, one voice socket per user, and a bounded speech wait queue constrain resource use. These are single-instance controls. The release tests do not establish a paid multi-tenant concurrency SLA. Measure invited pilot workloads before increasing customer quotas.

CPU neural video exports accept at most six seconds at 12 fps. Clips render much slower than playback. The live browser face rig plus streaming chat/Piper voice is the interactive alternative. The local voice pipeline is turn-based and gates input while the assistant speaks to reduce feedback; it is not full-duplex conversation with automatic barge-in. The stop button explicitly interrupts inference/playback.

For multiple app instances, add a shared job queue, shared rate limits and shared private media. SQLite mode is intended for a single process. Native MongoDB storage is tested with transactions on a local replica set; your actual Atlas/R2 account still requires verification.

Verification/recovery, privacy controls, notices, operations/monitor commands and offline restoration are implemented and tested. Public commercial activation still requires actual HTTPS hosting, SMTP deliverability, alerts, chosen-host restore/load checks, final business/legal details, and selected payment/provider/cloud account validation. GPU selection requires a verified CUDA worker. Read the V3 operations guide and current QC evidence.
