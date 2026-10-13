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
function requestBody(avatar, messages, stream = false) {
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
    max_tokens: 180,
    temperature: 0.6,
    stream,
  };
}
export async function reply(avatar, messages) {
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody(avatar, messages)),
    },
  );
  const d = await r.json();
  if (typeof d.choices?.[0]?.message?.content !== "string")
    throw unavailable("AI response");
  return { content: d.choices[0].message.content, demo: false };
}
export async function streamReply(avatar, messages, { signal, onToken }) {
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
