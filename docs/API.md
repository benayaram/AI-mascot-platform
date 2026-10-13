# BENAI API v1

Create an API key in **Integrations** with Creator/Business access. Send `Authorization: Bearer ps_…` on server-to-server requests. Keys are hashed at rest and revocable. Free-tier or downgraded keys cannot call v1 endpoints. All requests consume the owning customer’s plan quotas. JSON errors are returned as `{ "error": "description" }` with meaningful HTTP status codes.

```js
const response = await fetch(`${process.env.BENAI_ORIGIN}/api/v1/chat`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.BENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    avatar_id: "nova",
    message: "Help me plan my next launch.",
  }),
});
if (!response.ok) throw new Error((await response.json()).error);
const { content, conversation_id, demo, usage } = await response.json();
```

Continue a thread by sending `conversation_id` on subsequent requests with the same avatar. Threads remain scoped to the key owner. A failed provider operation refunds its usage reservation.

| Method | Endpoint                   | Body/result                                                                     |
| ------ | -------------------------- | ------------------------------------------------------------------------------- |
| GET    | `/api/v1/avatars`          | `{avatars:[…]}` — public characters and your private characters                 |
| POST   | `/api/v1/chat`             | `{avatar_id,message,conversation_id?}` → `{content,conversation_id,demo,usage}` |
| POST   | `/api/v1/tts`              | `{text,voice?}` → WAV for local speech or MP3 for OpenAI                        |
| GET    | `/api/v1/videos`           | `{videos:[…]}` — your rendering jobs                                            |
| POST   | `/api/v1/videos`           | `{avatar_id,script}` → HTTP 202 `{id,status}`                                   |
| GET    | `/api/videos/:id`          | Authorized job status; returns private download path on completion              |
| GET    | `/api/videos/:id/download` | Authorized MP4 or expiring R2 redirect                                          |
| POST   | `/api/transcribe`          | Authorized multipart `audio` recording, max 30 seconds, → `{text}`              |

Use the same bearer key for status/download routes. Maximum chat message length: 8,000 characters. TTS: 4,000. Local video script: 1,000 and maximum 60 seconds. Only one video render runs per application process; conflicting submissions return 429 before charging. Local jobs are resumed after process restarts. Monthly quota windows use UTC calendar months.

HTTP 401: missing/invalid authentication. 403: insufficient role, invalid CSRF/origin. 402: insufficient plan/usage allowance. 404: missing or inaccessible resource. 409: incompatible action. 429: rate/concurrency limit. 503: provider not configured. 502: provider unavailable or rejected request.

## Website widgets

Create an embed in Integrations, then copy the iframe. Its opaque ID grants only public chat and speech for that avatar, never the owner’s API or history. Embed usage is charged to the owner. It is intentionally publicly callable: rate limits and plan caps bound abuse. Revoke it when needed. The widget maintains a short in-browser conversation history and sends only that history for the current chat; it cannot retrieve account conversations.

## Browser sessions

Session-based state changes require `X-CSRF-Token` returned by login/register or `/api/auth/me`. Authentication uses an HttpOnly cookie; do not move sessions into localStorage. Browser origin must match `APP_URL` or the documented development origin. API keys do not need browser-session CSRF tokens and should stay on servers.

Voice quotas use rounded units: each transcription request reserves one minute; TTS reserves at least one minute and an additional unit for each 900 characters. Browser-only speech fallback has no server model usage.
