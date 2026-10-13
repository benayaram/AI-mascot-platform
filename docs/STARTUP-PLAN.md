# BENAI CPU pilot: founder and staffing plan

## Product decision

Start with five invited teams that need a website assistant or a presenter avatar. Offer the live voice/portrait studio as the primary product. Treat realistic neural video as a short, queued add-on: this CPU machine renders much slower than playback. Do not market realtime neural video, unlimited usage, human voice cloning, or 120 fps.

Use the existing computer first. Model inference needs no subscription or provider API key, but electricity, compute, disk, backup and bandwidth still have costs. Hosting estimates must come from actual provider quotes and a benchmark on the chosen server; the current cloud workspace is a development environment, not an established production host. Avoid buying a GPU for this pilot.

## Budget controls

- Keep one chat inference slot and one video render per app instance; the speech worker uses a bounded wait queue.
- Retain small free-tier quotas. Grant paid tiers manually while learning what customers use; do not take recurring payments until production billing and support workflows are validated.
- Keep neural scripts short (six seconds maximum on CPU). Reject excess work and refund failed operations rather than promising fast rendering.
- Persist and back up SQLite/media, or use Atlas/R2 only after actual account connectivity tests. Do not switch databases as a substitute for migration.
- Keep model binaries out of Git. Verified installation caches save bandwidth and repeated setup time.

## Lean staffing

The founder can own customer interviews, deployment, permissions, support and the release checklist. Use the existing application to collect concrete pilot feedback before hiring.

First outside help, when a budget exists: a short QA/security review of the deployed HTTPS origin and a small frontend accessibility/usability review. Scope each contractor engagement to explicit deliverables and acceptance checks. Do not add a full-time ML team or recurring GPU bill before customers demonstrate demand. The current report is an automated and manual self-review; it does not claim independent external QA approval.

## Pilot acceptance

Run an onboarding call with each team, configure only owned or permitted portraits, and show the synthetic-character disclosure. Measure actual answer usefulness, first-token/audio latency, microphone failures, completed exports, queue wait time and support requests. Capacity and error rates should be measured with the customers' workload, not inferred from these short test examples.

After at least two weeks of stable invited use, review whether customers value live voice, widget integration or video exports most. Only then expand hosting or commission improvements. If realtime neural video becomes a requirement, record it as a different hardware/product decision; the current CPU verdict does not support that promise.

## Before a public paid launch

Complete HTTPS deployment, secret management, backup/restore verification, legal/privacy documents, monitored uptime, abuse controls, account verification/recovery, payment-provider test checkout and real webhook delivery. Verify Atlas/R2 if selected. For multiple app processes, add a shared queue, shared rate limits and media storage. No public deployment or staff hiring has been carried out by this code release.
