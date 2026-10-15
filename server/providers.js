import { settings, credential, externalRequest } from "./customer-providers.js";
import { retrieve } from "./knowledge.js";
import Stripe from "stripe";
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
export const demo = process.env.DEMO_MODE === "true";
export const providers = () => ({
  ai: !!process.env.LOCAL_AI_URL,
  tts: !!process.env.LOCAL_SPEECH_URL,
  stt: !!process.env.LOCAL_SPEECH_URL,
  localVideo: !!process.env.LOCAL_SPEECH_URL,
  images: !!process.env.LOCAL_IMAGE_URL,
  video: !!process.env.LOCAL_PORTRAIT_URL,
  neuralVideo: !!process.env.LOCAL_PORTRAIT_URL,
  billing: !!(
    stripe &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_PRO_PRICE_ID &&
    process.env.STRIPE_BUSINESS_PRICE_ID
  ),
  demo,
  selfHosted: true,
});
export function unavailable(service) {
  const e = new Error(
    `${service} is offline. Start the corresponding self-hosted model service.`,
  );
  e.status = 503;
  return e;
}
export async function providerFetch(url, options = {}) {
  const { timeout = 90000, ...request } = options;
  const signal = request.signal
    ? AbortSignal.any([request.signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout);
  const r = await fetch(url, { ...request, signal });
  if (!r.ok) {
    const detail = r.status === 422 ? await r.json().catch(() => null) : null;
    const e = new Error(
      detail?.error ||
        `Self-hosted model request failed (${r.status}). Inspect the model service log.`,
    );
    e.status = r.status === 429 ? 429 : 502;
    throw e;
  }
  return r;
}
function requestBody(
  avatar,
  messages,
  stream = false,
  maxTokens = 180,
  json = false,
) {
  let history = messages.slice(-12);
  while (
    history.length > 1 &&
    history.reduce((n, m) => n + m.content.length, 0) > 6000
  )
    history.shift();
  return {
    model: "local",
    messages: [
      {
        role: "system",
        content:
          avatar.prompt.slice(0, 2500) +
          (avatar.knowledge_text
            ? "\nBusiness reference facts (do not invent missing details):\n" +
              avatar.knowledge_text.slice(0, 4000)
            : ""),
      },
      ...history.map((m) => ({ ...m, content: m.content.slice(0, 5000) })),
    ],
    max_tokens: Math.max(1, Math.min(1200, maxTokens)),
    ...(json ? { response_format: { type: "json_object" } } : {}),
    temperature: 0.6,
    stream,
  };
}
async function context(avatar, messages, userId, useKnowledge = true) {
  const prefs = userId
    ? await settings(userId)
    : { chat: "local", language: "en" };
  const sources = useKnowledge
    ? await retrieve(userId, messages.at(-1).content)
    : [];
  const languages = {
    en: "English",
    te: "Telugu",
    hi: "Hindi",
    ta: "Tamil",
    kn: "Kannada",
    es: "Spanish",
    auto: "the user's language",
  };
  const prompt =
    avatar.prompt +
    (prefs.grounded_only
      ? "\nAnswer only using provided reference facts. If unsupported, say you do not know from these sources."
      : "") +
    `\nAnswer in ${languages[prefs.language] || "English"}. Ask a short clarifying question if the request is ambiguous. Acknowledge uncertainty; do not invent facts or citations. Keep answers concise.`;
  const grounded = {
    ...avatar,
    prompt: prompt.slice(-2500),
    knowledge_text: [
      avatar.knowledge_text,
      ...sources.map((s, i) => `[${i + 1}] ${s.name}: ${s.text}`),
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000),
  };
  return {
    prefs,
    sources: sources.map(({ id, name, index }) => ({ id, name, index })),
    grounded,
  };
}
async function geminiAnswer(
  avatar,
  messages,
  prefs,
  userId,
  signal,
  maxTokens = 450,
  json = false,
) {
  const c = await credential(userId, "gemini_chat");
  const body = requestBody(avatar, messages);
  const r = await externalRequest(
    "gemini_chat",
    "/v1beta/models/" +
      encodeURIComponent(prefs.chat_model || c.model) +
      ":generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": c.key },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: body.messages[0].content }] },
        contents: body.messages.slice(1).map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: Math.min(maxTokens, 1200),
          temperature: 0.4,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  );
  const d = await r.json();
  const content = d.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("");
  if (!content?.trim())
    throw Object.assign(
      Error(
        "Gemini returned no answer. Check the model, quota or safety response.",
      ),
      { status: 502 },
    );
  return {
    content,
    demo: false,
    model: prefs.chat_model,
    provider: "gemini_chat",
  };
}
export async function reply(
  avatar,
  messages,
  { userId, signal, maxTokens = 180, json = false, useKnowledge = true } = {},
) {
  const ctx = await context(avatar, messages, userId, useKnowledge);
  avatar = ctx.grounded;
  if (ctx.prefs.grounded_only && !ctx.sources.length && !avatar.knowledge_text)
    return {
      content:
        ctx.prefs.language === "te"
          ? "మీ ఆధార పత్రాల్లో దీనికి సమాధానం కనిపించలేదు. దయచేసి సంబంధిత పత్రాన్ని జోడించండి లేదా ప్రశ్నను స్పష్టంగా అడగండి."
          : "I could not find that in your uploaded sources. Please add the relevant document or clarify your question.",
      demo: false,
      sources: [],
      provider: "retrieval",
    };
  if (ctx.prefs.chat === "gemini_chat") {
    try {
      return {
        ...(await geminiAnswer(
          avatar,
          messages,
          ctx.prefs,
          userId,
          signal,
          maxTokens,
          json,
        )),
        sources: ctx.sources,
      };
    } catch (e) {
      if (!ctx.prefs.local_fallback || signal?.aborted) throw e;
    }
  }

  if (!process.env.LOCAL_AI_URL) {
    if (!demo) throw unavailable("AI conversation");
    return {
      content: `Demo response from ${avatar.name}: I’d be happy to help with “${messages.at(-1).content.slice(0, 180)}”. Connect the local model for a real answer.`,
      demo: true,
    };
  }
  const r = await providerFetch(
    process.env.LOCAL_AI_URL + "/chat/completions",
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        requestBody(avatar, messages, false, maxTokens, json),
      ),
    },
  );
  const d = await r.json();
  if (typeof d.choices?.[0]?.message?.content !== "string")
    throw unavailable("AI response");
  return {
    content: d.choices[0].message.content,
    demo: false,
    sources: ctx.sources,
    provider: "local",
  };
}
export async function streamReply(
  avatar,
  messages,
  { signal, onToken, userId, onSources },
) {
  const ctx = await context(avatar, messages, userId);
  onSources?.(ctx.sources);
  if (ctx.prefs.chat === "gemini_chat" || ctx.prefs.grounded_only) {
    const result = await reply(avatar, messages, { userId, signal });
    onToken(result.content);
    return result.content;
  }
  avatar = ctx.grounded;
  if (!process.env.LOCAL_AI_URL) throw unavailable("Streaming conversation");
  const r = await providerFetch(
    process.env.LOCAL_AI_URL + "/chat/completions",
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody(avatar, messages, true)),
    },
  );
  const decoder = new TextDecoder();
  let buffer = "",
    content = "";
  for await (const chunk of r.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 1);
      if (!line.startsWith("data:") || line === "data: [DONE]") continue;
      const data = JSON.parse(line.slice(5));
      const token = data.choices?.[0]?.delta?.content || "";
      content += token;
      if (token) onToken(token);
    }
  }
  if (!content.trim()) throw unavailable("Streaming answer");
  return content;
}
