# BENAI V2 APIs

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
