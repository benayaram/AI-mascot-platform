import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { store, dataDir } from "./storage.js";
const keyFile = join(dataDir, ".provider-master-key");
let master;
if (process.env.BYOK_MASTER_KEY)
  master = Buffer.from(process.env.BYOK_MASTER_KEY, "base64");
else {
  if (process.env.NODE_ENV === "production")
    throw Error(
      "Set BYOK_MASTER_KEY to a securely generated base64-encoded 32-byte key before production startup",
    );
  if (!existsSync(keyFile)) {
    try {
      writeFileSync(keyFile, randomBytes(32), { mode: 0o600, flag: "wx" });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  }
  master = readFileSync(keyFile);
}
if (master.length !== 32)
  throw Error("BYOK_MASTER_KEY must decode to exactly 32 bytes");
export const providerCatalog = {
  gemini: {
    name: "Google Gemini TTS",
    kind: "tts",
    models: [
      "gemini-3.8-flash-tts",
      "gemini-3.8-flash-lite-tts",
      "gemini-2.5-flash-preview-tts",
    ],
    voice: "Kore",
    model: "gemini-3.8-flash-tts",
  },
  openai: {
    name: "OpenAI TTS",
    kind: "tts",
    models: ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"],
    voice: "coral",
    model: "gpt-4o-mini-tts",
  },
  elevenlabs: {
    name: "ElevenLabs",
    kind: "tts",
    models: ["eleven_flash_v2_5", "eleven_multilingual_v2"],
    voice: "",
    model: "eleven_flash_v2_5",
  },
  heygen: {
    name: "HeyGen video",
    kind: "video",
    models: [],
    voice: "",
    model: "",
  },
};
export const defaultSettings = {
  tts: "local",
  video: "local",
  compute: "cpu",
  quality: "fast",
};
export async function settings(userId) {
  return {
    ...defaultSettings,
    ...(await store.one("customer_settings", { id: userId })),
  };
}
export async function saveDocument(collection, id, data) {
  if (await store.one(collection, { id }))
    return store.update(collection, { id }, data);
  try {
    return await store.insert(collection, { id, ...data });
  } catch (e) {
    if (e.code !== 11000 && ![1555, 2067].includes(e.errcode)) throw e;
    return store.update(collection, { id }, data);
  }
}
export function seal(id, secret) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", master, iv);
  cipher.setAAD(Buffer.from(id));
  const bytes = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    ciphertext: bytes.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    version: 1,
  };
}
function open(id, row) {
  const cipher = createDecipheriv(
    "aes-256-gcm",
    master,
    Buffer.from(row.iv, "base64"),
  );
  cipher.setAAD(Buffer.from(id));
  cipher.setAuthTag(Buffer.from(row.tag, "base64"));
  return Buffer.concat([
    cipher.update(Buffer.from(row.ciphertext, "base64")),
    cipher.final(),
  ]).toString("utf8");
}
export async function saveCredential(
  userId,
  provider,
  { key, model, voice, avatar_id },
) {
  const id = userId + ":" + provider,
    prior = await store.one("provider_credentials", { id });
  if (!key && !prior)
    throw Object.assign(Error("Enter an API key"), { status: 400 });
  const data = {
    user_id: userId,
    provider,
    model: model ?? prior?.model ?? providerCatalog[provider].model,
    voice: voice ?? prior?.voice ?? providerCatalog[provider].voice,
    avatar_id: avatar_id ?? prior?.avatar_id ?? "",
    updated_at: new Date().toISOString(),
    tested_at: null,
    ...(key ? seal(id, key) : {}),
  };
  await saveDocument("provider_credentials", id, data);
}
export async function credential(userId, provider) {
  const row = await store.one("provider_credentials", {
    id: userId + ":" + provider,
  });
  if (!row)
    throw Object.assign(
      Error("Save your " + provider + " API key in AI settings first"),
      { status: 400 },
    );
  try {
    return { ...row, key: open(row.id, row) };
  } catch {
    throw Object.assign(
      Error(
        "Saved provider key could not be decrypted. Re-enter it or restore the original server encryption key.",
      ),
      { status: 503 },
    );
  }
}
export async function credentialSummaries(userId) {
  return (await store.find("provider_credentials", { user_id: userId })).map(
    ({ provider, model, voice, avatar_id, updated_at, tested_at }) => ({
      provider,
      model,
      voice,
      avatar_id,
      updated_at,
      tested_at,
      configured: true,
    }),
  );
}
export async function externalRequest(
  provider,
  path,
  options = {},
  fetcher = fetch,
) {
  const roots = {
    gemini: "https://generativelanguage.googleapis.com",
    openai: "https://api.openai.com",
    elevenlabs: "https://api.elevenlabs.io",
    heygen: "https://api.heygen.com",
  };
  // Loopback fixtures are available only to the automated test process, never to customers.
  const fixture =
    process.env.NODE_ENV === "test"
      ? process.env.BENAI_PROVIDER_FIXTURE_URL
      : null;
  if (fixture && !/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture))
    throw Error("Invalid provider fixture URL");
  const r = await fetcher((fixture || roots[provider]) + path, {
    ...options,
    redirect: "error",
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(90000)])
      : AbortSignal.timeout(90000),
  });
  if (!r.ok)
    throw Object.assign(
      Error(
        `${providerCatalog[provider].name} request failed (${r.status}). Check your key, account balance and selected model.`,
      ),
      { status: r.status === 429 ? 429 : 502 },
    );
  return r;
}
export function pcmWav(bytes, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(bytes.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(bytes.length, 40);
  return Buffer.concat([header, bytes]);
}
export async function customerSpeech(userId, text, signal, onAudio) {
  const prefs = await settings(userId);
  if (prefs.tts === "local") return null;
  const name = prefs.tts,
    c = await credential(userId, name);
  let response;
  const headers = { "Content-Type": "application/json" };
  if (name === "gemini") {
    headers["x-goog-api-key"] = c.key;
    let data;
    if (c.model.startsWith("gemini-3.8-")) {
      response = await externalRequest(name, "/v1beta/interactions", {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          model: c.model,
          ...(onAudio ? { stream: true } : {}),
          store: false,
          input: [{ type: "user_input", content: [{ type: "text", text }] }],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice: c.voice || "Kore" }] },
        }),
      });
      if (onAudio) {
        const chunks = [];
        let buffer = "",
          pending = Buffer.alloc(0);
        const decoder = new TextDecoder();
        for await (const bytes of response.body) {
          buffer += decoder.decode(bytes, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          let boundary;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const line = block
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim())
              .join("\n");
            if (!line || line === "[DONE]") continue;
            const event = JSON.parse(line);
            if (event.event_type === "error")
              throw Object.assign(
                Error(
                  "Gemini audio stream failed. Check your provider account.",
                ),
                { status: 502 },
              );
            if (
              event.event_type === "step.delta" &&
              event.delta?.type === "audio" &&
              event.delta.data
            ) {
              const pcm = Buffer.from(event.delta.data, "base64");
              chunks.push(pcm);
              pending = Buffer.concat([pending, pcm]);
              if (pending.length >= 12000) {
                onAudio(pcmWav(pending));
                pending = Buffer.alloc(0);
              }
            }
          }
        }
        if (pending.length) onAudio(pcmWav(pending));
        if (!chunks.length)
          throw Object.assign(Error("Gemini returned no streamed audio"), {
            status: 502,
          });
        return pcmWav(Buffer.concat(chunks));
      }
      const d = await response.json();
      data = d.steps
        ?.filter((s) => s.type === "model_output")
        .flatMap((s) => s.content || [])
        .filter((s) => s.type === "audio")
        .at(-1);
    } else {
      response = await externalRequest(
        name,
        "/v1beta/models/" + encodeURIComponent(c.model) + ":generateContent",
        {
          method: "POST",
          headers,
          signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: c.voice || "Kore" },
                },
              },
            },
          }),
        },
      );
      const d = await response.json(),
        part = d.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      data = part?.inlineData;
    }
    if (!data?.data)
      throw Object.assign(
        Error("Gemini did not return audio for the selected model"),
        { status: 502 },
      );
    const bytes = Buffer.from(data.data, "base64");
    return bytes.subarray(0, 4).toString() === "RIFF" ? bytes : pcmWav(bytes);
  }
  if (name === "openai")
    response = await externalRequest(name, "/v1/audio/speech", {
      method: "POST",
      headers: { ...headers, Authorization: "Bearer " + c.key },
      signal,
      body: JSON.stringify({
        model: c.model,
        input: text,
        voice: c.voice || "coral",
        response_format: "wav",
      }),
    });
  if (name === "elevenlabs") {
    if (!c.voice)
      throw Object.assign(Error("Select an ElevenLabs voice ID"), {
        status: 400,
      });
    response = await externalRequest(
      name,
      "/v1/text-to-speech/" +
        encodeURIComponent(c.voice) +
        "?output_format=pcm_24000",
      {
        method: "POST",
        headers: { ...headers, "xi-api-key": c.key },
        signal,
        body: JSON.stringify({ text, model_id: c.model }),
      },
    );
  }
  const audio = Buffer.from(await response.arrayBuffer());
  return name === "elevenlabs" ? pcmWav(audio) : audio;
}
export async function discoverProvider(userId, name) {
  const c = await credential(userId, name),
    auth =
      name === "gemini"
        ? { "x-goog-api-key": c.key }
        : name === "elevenlabs"
          ? { "xi-api-key": c.key }
          : name === "heygen"
            ? { "X-Api-Key": c.key }
            : { Authorization: "Bearer " + c.key };
  const path =
    name === "gemini"
      ? "/v1beta/models"
      : name === "openai"
        ? "/v1/models"
        : name === "elevenlabs"
          ? "/v1/voices"
          : "/v2/avatars";
  const d = await (await externalRequest(name, path, { headers: auth })).json();
  const heygenVoices =
    name === "heygen"
      ? (
          await (
            await externalRequest(name, "/v2/voices", { headers: auth })
          ).json()
        ).data?.voices
      : [];
  await store.update(
    "provider_credentials",
    { id: c.id },
    { tested_at: new Date().toISOString() },
  );
  return {
    models:
      name === "gemini"
        ? (d.models || [])
            .filter((m) => /tts/i.test(m.name))
            .map((m) => m.name.replace("models/", ""))
        : name === "openai"
          ? (d.data || []).filter((m) => /tts/i.test(m.id)).map((m) => m.id)
          : providerCatalog[name].models,
    voices:
      name === "elevenlabs"
        ? (d.voices || []).map((v) => ({ id: v.voice_id, name: v.name }))
        : name === "heygen"
          ? (heygenVoices || []).map((v) => ({ id: v.voice_id, name: v.name }))
          : [],
    avatars:
      name === "heygen"
        ? (d.data?.avatars || []).map((a) => ({
            id: a.avatar_id,
            name: a.avatar_name,
          }))
        : [],
  };
}
