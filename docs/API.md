# BENAI V3 APIs

## REST

Create a customer API key in **Integrations** with Creator/Business access. Send `Authorization: Bearer ps_…` on server-side requests. These are BENAI account keys, not OpenAI/HeyGen keys. Keys are hashed at rest, revocable and blocked when the plan no longer includes API access.

| Method   | Endpoint                   | Body/result                                                                     |
| -------- | -------------------------- | ------------------------------------------------------------------------------- |
| GET      | `/api/v1/avatars`          | Public avatars and the key owner's private avatars                              |
| POST     | `/api/v1/chat`             | `{avatar_id,message,conversation_id?}` → `{content,conversation_id,demo,usage}` |
| POST     | `/api/v1/tts`              | `{text,voice?}` → local WAV speech                                              |
| GET/POST | `/api/v1/videos`           | List own videos / `{avatar_id,script}` → HTTP 202 job                           |
| GET      | `/api/videos/:id`          | Own job status and local model/render metadata                                  |
| GET      | `/api/videos/:id/download` | Own MP4 or expiring R2 redirect                                                 |
| POST     | `/api/transcribe`          | Authorized multipart `audio`, max 30 seconds → `{text}`                         |
| POST     | `/api/avatars/generate`    | `{prompt,style:'illustration'                                                   | 'realistic'}` → private generated image |
| GET      | `/api/assets`              | Own recent media, for recovering/selecting generated portraits                  |
| GET      | `/api/models`              | Actual readiness of configured self-hosted workers                              |

HTTP errors: 401 auth, 403 ownership/role/CSRF/origin, 402 plan quota, 404 inaccessible resource, 429 concurrency/rate limit, 503 missing model service, 502 inference failure. Failed model work refunds the applicable reservation.

Realistic avatars require `kind:'realistic'` and `rights_confirmed:true`. Private uploads cannot be reused across customer accounts. Public presets can be copied. The administrator has explicitly granted platform access. PNG/JPEG/WebP uploads are decoded, limited to 32 megapixels, normalized to PNG and resized to at most 1024 pixels.

## Own realtime protocol

Connect to `ws(s)://YOUR_BENAI_ORIGIN/api/realtime` using an authenticated browser session. The upgrade checks the exact Origin and session cookie. One connection is allowed per user; every turn rechecks session validity. State changes require the `csrf` token returned by `/api/auth/me`. Never put tokens in the URL.

```json
{
  "type": "turn",
  "csrf": "SESSION_CSRF",
  "avatar_id": "amara",
  "text": "Hello!",
  "speak": true
}
```

For microphone input, replace `text` with `audio`, a base64 WebM or WAV recording. Keep recordings under 25 seconds in the live client. An existing `conversation_id` continues that user's thread. Do not send both `text` and `audio`.

Events: `ready`, `state`, `transcript`, streaming `token`, final `reply`, WAV `audio` (base64), `done` with real timings/usage, `error`, and `interrupted`. `{"type":"interrupt"}` cancels current inference. Uncommitted turns are refunded. A reply already persisted remains in history if cancellation happens during speech; voice reservations are refunded if speech was not delivered.

The local voice pipeline uses silence detection then transcription → streaming chat → synthesis. It is turn-based, not a native full-duplex speech model. The model services themselves are not exposed to customer browsers.

## Quotas and widgets

Monthly quotas use UTC calendar months. HTTP transcription reserves one rounded voice unit and TTS at least one unit per 900 characters. A realtime spoken turn reserves one unit for recognition and one for its synthesized response; text-only realtime turns reserve a voice unit only if speech is requested. Avatar inventory limits persist across months and are atomic under concurrent creation.

Website widgets use revocable opaque embed IDs with only chat/speech and the selected image. Public widgets consume their owner's allowances and cannot retrieve account history, keys or unrelated media. A private portrait shared through a widget is accessible through that still-active widget's scoped image endpoint. Removing the embed revokes that endpoint. Keep account API keys off the frontend.

## V3 routes

Cookie authentication and CSRF protect account/provider management; integration API keys cannot manage customer provider secrets.

| Method      | Path                                                       | Behavior                                                                            |
| ----------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| GET/PUT     | `/api/provider-settings`                                   | Catalog, credential summaries, choices and verified compute availability            |
| PUT/DELETE  | `/api/provider-credentials/:provider`                      | Save encrypted credentials / delete and reset selected provider                     |
| POST        | `/api/provider-credentials/:provider/test`                 | Authenticated model/voice/avatar discovery; does not prove generation entitlement   |
| POST        | `/api/provider-preview`                                    | Short WAV preview using saved speech choice; voice quota and provider charges apply |
| GET         | `/api/runtime`                                             | CPU/CUDA worker availability and clip limits                                        |
| GET         | `/api/ready`                                               | Minimal public readiness; 200 ready / 503 degraded                                  |
| GET         | `/api/admin/operations`                                    | Admin-only worker/job/configuration status, no raw secrets                          |
| POST        | `/api/auth/forgot-password`, `/api/auth/reset-password`    | One-use hashed reset token; revokes sessions/API keys                               |
| POST        | `/api/auth/request-verification`, `/api/auth/verify-email` | Actual SMTP verification and atomic token consumption                               |
| GET/DELETE  | `/api/account/export`, `/api/account`                      | Cookie-only sanitized export; deletion requires password and `confirmation: DELETE` |
| GET/DELETE  | `/api/assets`, `/api/assets/:id`                           | Private gallery (all=1 for full bounded inventory); delete unused owned portraits   |
| GET/POST    | `/api/templates`, `/api/templates/:id/use`                 | Templates; creation with `name` and up to 4,000 characters of business `facts`      |
| GET         | `/api/growth`                                              | Private demo/lead/referral statistics                                               |
| POST/DELETE | `/api/demos`, `/api/demos/:id`                             | Opt-in public demo publication and revocation                                       |
| GET/POST    | `/api/public-demo/:id`, `/visit`, `/chat`, `/leads`        | Public scoped demo, session counts, owner-quota chat, consented lead capture        |
| DELETE      | `/api/leads/:id`                                           | Owner-only lead removal                                                             |

Video creation accepts optional `compute: cpu|gpu` and `quality: fast|neural`, defaulting to saved settings (new accounts: CPU/fast). The saved video provider chooses local versus HeyGen. GPU availability is checked before reserving video usage. External video uses the customer’s HeyGen avatar/voice IDs and infrastructure.

Gemini 3.8 studio TTS produces multiple `audio` events with `streamed:true` and WAV-wrapped PCM chunks; play them in order. The final `done.timing` includes first-chunk and complete-audio times. Local/OpenAI/ElevenLabs speech currently uses a complete WAV event. Text generation remains local Qwen; speech recognition remains local Whisper. This transport does not implement Gemini Live multimodal sessions or automatic full-duplex barge-in.

All public-demo identifiers are scoped, revokeable capabilities. Demo routes do not gain privileges from account cookies; their public mutations are exempt from cookie CSRF, like widgets, while the server still rejects supplied foreign Origins. No provider key, avatar prompt or business-fact document is returned by demo metadata. The owner agrees to publish the portrait/demo and is responsible for the information the assistant uses.
