# Deploying BENAI

A single Linux x86-64 server with Node 24, Python 3.12, FFmpeg, curl, and unzip can run the included CPU workflow. Public hosting and a domain are not created by this repository. Use a persistent application volume. The small chat model is appropriate for development and modest usage; benchmark your expected concurrent workload before accepting paid customers.

1. Clone the repository and run `npm ci` and `npm run build`.
2. Create `.env` using `.env.example`; enter real credentials only on the server or in its secret manager. Set the HTTPS `APP_URL`, `NODE_ENV=production`, `DEMO_MODE=false`, local service URLs, and your storage backend.
3. Run `npm run setup:local` and keep the runtime/model directory on a persistent volume.
4. Supervise `npm run services:local` and `npm start` using systemd, your host’s process supervisor, or your container platform. Restart both if the host restarts. Do not expose ports 8081, 8082, or 8083 publicly.
5. Put a TLS reverse proxy in front of port 3001. Permit only your proxy to reach the application. If there is exactly one trusted proxy, set `TRUST_PROXY=1`; otherwise leave it unset and configure Express’s trusted proxy policy for your architecture before deployment.
6. Register and promote your first administrator with the documented CLI. Review free-tier limits and publish appropriate privacy/terms documents for your actual business.
7. If using Atlas, add the server IP to Atlas’s access list and confirm a native TLS database connection. If using R2, grant bucket-scoped credentials and check upload/signed download behavior. MongoDB and R2 connections cannot be verified without your accounts.
8. If charging customers, configure real Stripe prices, portal, and webhook. Run a Stripe test-mode checkout and observe verified webhook synchronization before switching to live payment keys.
9. Back up `.data`, including uploads and local videos, or your MongoDB/R2 data plus remaining local uploads. Rotating/deleting an R2 bucket breaks older video references. Configure retention intentionally; the app does not delete user media on a timer.

## Readiness

`/api/health` proves the web process and selected database started. Provider flags indicate configured routes, not continuous health probes. Check `http://127.0.0.1:8081/health` and `http://127.0.0.1:8082/health` internally, then run `npm run test:e2e` against the included local services for functional readiness. For deployment, repeat a real authenticated chat, synthesis, microphone transcription, video render/download, admin plan grant, and widget interaction on the HTTPS origin.

Microphone APIs need HTTPS outside localhost. The default voice mode records an utterance until a silence gap and then runs local transcription → chat → speech. While the assistant speaks, input is gated to prevent feedback. It is a turn-based local voice pipeline, not the reference provider’s proprietary full-duplex low-latency system. Use the SDK’s MediaStream route to render audio from your own realtime voice-agent service if needed.

## Scale and account lifecycle

Local render concurrency and rate limits are per web process; SQLite uses one process and a persistent volume. For multiple application instances, use MongoDB, shared media storage, a distributed render queue, shared rate limits, and a provider concurrency controller. These distributed components are not included. Current sessions last seven days. There is no built-in mail provider, email verification, or self-service password reset. Do not promise those workflows to customers until implemented and connected to your mail provider.
