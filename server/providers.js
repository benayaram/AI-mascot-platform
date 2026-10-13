import Stripe from "stripe";
export const aiKey = process.env.AI_PROVIDER_KEY || process.env.OPENAI_API_KEY;
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
export const demo = process.env.DEMO_MODE === "true";
export const providers = () => ({
  ai: !!(process.env.LOCAL_AI_URL || aiKey),
  tts: !!(process.env.LOCAL_SPEECH_URL || aiKey),
  stt: !!process.env.LOCAL_SPEECH_URL,
  localVideo: !!process.env.LOCAL_SPEECH_URL,
  images: !!(process.env.LOCAL_IMAGE_URL || aiKey),
  video: !!process.env.HEYGEN_API_KEY,
  billing: !!(
    stripe &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_PRO_PRICE_ID &&
    process.env.STRIPE_BUSINESS_PRICE_ID
  ),
  demo,
});
export function unavailable(service) {
  const e = new Error(
    `${service} is not configured. An administrator must connect this provider.`,
  );
  e.status = 503;
  return e;
}
export async function providerFetch(url, options) {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) {
    const e = new Error(
      `Provider request failed (${r.status}). Check the provider configuration and account balance.`,
    );
    e.status = 502;
    throw e;
  }
  return r;
}
export async function aiJSON(path, body) {
  if (!aiKey) throw unavailable("AI");
  return (
    await providerFetch("https://api.openai.com/v1/" + path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
  ).json();
}
export async function reply(avatar, messages) {
  if (process.env.LOCAL_AI_URL) {
    let history = messages.slice(-12);
    while (
      history.length > 1 &&
      history.reduce((n, m) => n + m.content.length, 0) > 6000
    )
      history.shift();
    const r = await providerFetch(
      process.env.LOCAL_AI_URL + "/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "local",
          messages: [
            { role: "system", content: avatar.prompt.slice(0, 2500) },
            ...history.map((m) => ({
              ...m,
              content: m.content.slice(0, 5000),
            })),
          ],
          max_tokens: 320,
          temperature: 0.7,
        }),
      },
    );
    const data = await r.json();
    return { content: data.choices[0].message.content, demo: false };
  }
  if (!aiKey) {
    if (!demo) throw unavailable("AI conversation");
    const text = messages.at(-1).content;
    return {
      content: `Demo response from ${avatar.name}: I’d be happy to help with “${text.slice(0, 180)}”. In live mode, I can use my personality and your conversation history to give a complete answer. Connect an AI provider to start real conversations.`,
      demo: true,
    };
  }
  const r = await aiJSON("chat/completions", {
    model: process.env.AI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: avatar.prompt },
      ...messages.slice(-20),
    ],
    max_tokens: 600,
  });
  return { content: r.choices[0].message.content, demo: false };
}
