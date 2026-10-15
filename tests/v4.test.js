import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const dir = mkdtempSync(join(tmpdir(), "benai-v4-")),
  base = "http://127.0.0.1:3153";
let child,
  fixture,
  alice,
  bob,
  calls = [],
  failure = false;
async function request(
  path,
  { method = "GET", body, session = alice, form } = {},
) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      ...(!form ? { "Content-Type": "application/json" } : {}),
      ...(session
        ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf }
        : {}),
    },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function register(email) {
  const r = await request("/auth/register", {
    method: "POST",
    session: null,
    body: {
      name: "V4 reviewer",
      email,
      password: randomBytes(16).toString("hex"),
    },
  });
  assert.equal(r.status, 200);
  return { cookie: r.cookie, csrf: r.data.csrf, user: r.data.user };
}
async function prefs(p) {
  const current = (await request("/provider-settings")).data.settings;
  const r = await request("/provider-settings", {
    method: "PUT",
    body: { ...current, ...p },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
}
const draft = {
  title: "Water cycle",
  avatar_id: "elena",
  animate_avatar: false,
  quality: "fast",
  scenes: [
    {
      title: "Evaporation",
      narration: "The sun warms water. Water becomes vapour.",
      points: ["Solar energy", "Water vapour"],
      visual: "steps",
    },
  ],
};
before(async () => {
  fixture = createServer(async (req, res) => {
    let bytes = "";
    for await (const part of req) bytes += part;
    calls.push({
      url: req.url,
      headers: req.headers,
      body: bytes ? JSON.parse(bytes) : null,
    });
    if (failure) {
      res.writeHead(429);
      res.end("{}");
      return;
    }
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/text:synthesize")
      res.end(
        JSON.stringify({
          audioContent: Buffer.from("RIFFfixtureGoogleSpeech").toString(
            "base64",
          ),
        }),
      );
    else if (req.url?.includes("generateContent"))
      res.end(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "Water turns to vapour when heated. [1]" }],
              },
            },
          ],
        }),
      );
    else if (req.url === "/chat/completions")
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: calls.at(-1).body.response_format
                  ? JSON.stringify({
                      title: "Water",
                      scenes: [
                        {
                          title: "Evaporation",
                          narration:
                            "The sun warms water and turns it into vapour.",
                        },
                      ],
                    })
                  : "Local answer",
              },
            },
          ],
        }),
      );
    else res.end("{}");
  });
  await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
  const fixtureUrl = "http://127.0.0.1:" + fixture.address().port;
  child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: "3153",
      APP_URL: base,
      DATA_DIR: dir,
      MONGODB_URI: "",
      ADMIN_EMAIL: "",
      ADMIN_PASSWORD: "",
      STRIPE_SECRET_KEY: "",
      DEMO_MODE: "false",
      LOCAL_AI_URL: fixtureUrl,
      LOCAL_SPEECH_URL: "",
      LOCAL_IMAGE_URL: "",
      LOCAL_PORTRAIT_URL: "",
      BENAI_PROVIDER_FIXTURE_URL: fixtureUrl,
      ENABLE_EDGE_TTS: "false",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  alice = await register("alice@v4.benai");
  bob = await register("bob@v4.benai");
});
after(async () => {
  if (child?.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((r) => child.once("close", r));
  }
  await new Promise((r) => fixture?.close(r));
  rmSync(dir, { recursive: true, force: true });
});
test("language preferences persist and experimental Edge requires operator enablement", async () => {
  await prefs({ language: "te", edge_voice: "te-IN-ShrutiNeural" });
  assert.equal(
    (await request("/provider-settings")).data.settings.language,
    "te",
  );
  const r = await request("/provider-settings", {
    method: "PUT",
    body: {
      ...(await request("/provider-settings")).data.settings,
      tts: "edge",
    },
  });
  assert.equal(r.status, 503);
  await prefs({ language: "en" });
});
test("private uploaded sources reach only the owning account and strict retrieval refuses unrelated questions", async () => {
  const r = await request("/knowledge", {
    method: "POST",
    body: {
      name: "Water science notes",
      text: "Evaporation is the conversion of liquid water into water vapour when solar energy heats it.",
    },
  });
  assert.equal(r.status, 201);
  assert.equal(
    (await request("/knowledge", { session: bob })).data.documents.length,
    0,
  );
  await prefs({ grounded_only: true });
  const answer = await request("/chat", {
    method: "POST",
    body: { avatar_id: "elena", message: "Explain evaporation" },
  });
  assert.equal(answer.status, 200);
  assert.equal(answer.data.sources[0].name, "Water science notes");
  assert.ok(calls.at(-1).body.messages[0].content.includes("solar energy"));
  const no = await request("/chat", {
    method: "POST",
    body: { avatar_id: "elena", message: "zzzzzz" },
  });
  assert.equal(no.data.provider, "retrieval");
  assert.match(no.data.content, /could not find/);
  await prefs({ grounded_only: false });
});
test("PDF/TXT knowledge uploads are bounded and reject unsupported files", async () => {
  const form = new FormData();
  form.append(
    "file",
    new Blob(["Plants use sunlight to make sugars through photosynthesis."], {
      type: "text/plain",
    }),
    "biology.txt",
  );
  assert.equal(
    (await request("/knowledge", { method: "POST", form })).status,
    201,
  );
  const invalid = new FormData();
  invalid.append("file", new Blob(["<html>unsafe</html>"]), "page.html");
  assert.equal(
    (await request("/knowledge", { method: "POST", form: invalid })).status,
    400,
  );
});
test("Gemini answers use independent encrypted credentials, selected model and language instructions", async () => {
  const key = randomBytes(24).toString("hex");
  assert.equal(
    (
      await request("/provider-credentials/gemini_chat", {
        method: "PUT",
        body: { key, model: "gemini-2.5-flash-lite" },
      })
    ).status,
    200,
  );
  await prefs({ chat: "gemini_chat", language: "te" });
  const r = await request("/chat", {
    method: "POST",
    body: { avatar_id: "elena", message: "Explain water evaporation" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.provider, "gemini_chat");
  const call = calls.at(-1);
  assert.match(call.url, /gemini-2.5-flash-lite:generateContent/);
  assert.equal(call.headers["x-goog-api-key"], key);
  assert.match(call.body.systemInstruction.parts[0].text, /Telugu/);
  assert.ok(
    !JSON.stringify((await request("/provider-settings")).data).includes(key),
  );
  assert.ok(
    !readFileSync(join(dir, "benai.sqlite")).includes(Buffer.from(key)),
  );
  await prefs({ language: "en" });
});
test("Gemini rate limits fail clearly without implicit fallback and refund message quota", async () => {
  const before = (await request("/auth/me")).data.usage.messages;
  failure = true;
  const r = await request("/chat", {
    method: "POST",
    body: { avatar_id: "elena", message: "What is water?" },
  });
  failure = false;
  assert.equal(r.status, 429);
  assert.equal((await request("/auth/me")).data.usage.messages, before);
  assert.equal(
    (await request("/provider-credentials/gemini_chat", { method: "DELETE" }))
      .status,
    200,
  );
  assert.equal(
    (await request("/provider-settings")).data.settings.chat,
    "local",
  );
});
test("Google Telugu TTS uses the official endpoint and tenant key, then deletion restores local speech", async () => {
  await request("/provider-credentials/google", {
    method: "PUT",
    body: { key: randomBytes(24).toString("hex"), voice: "te-IN-Standard-A" },
  });
  await prefs({ tts: "google" });
  const r = await fetch(base + "/api/tts", {
    method: "POST",
    headers: {
      Cookie: alice.cookie,
      "X-CSRF-Token": alice.csrf,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: "నమస్కారం" }),
  });
  assert.equal(r.status, 200);
  assert.equal(
    Buffer.from(await r.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    "RIFF",
  );
  const call = calls.at(-1);
  assert.equal(call.url, "/v1/text:synthesize");
  assert.equal(call.body.voice.languageCode, "te-IN");
  assert.equal(call.body.voice.name, "te-IN-Standard-A");
  await request("/provider-credentials/google", { method: "DELETE" });
  const local = await request("/tts", {
    method: "POST",
    body: { text: "నమస్కారం" },
  });
  assert.equal(local.status, 503);
});
test("lesson draft CRUD, private ownership and supporting media ownership are enforced", async () => {
  const r = await request("/lessons", { method: "POST", body: draft });
  assert.equal(r.status, 201);
  const id = r.data.lesson.id;
  assert.equal((await request("/lessons/" + id, { session: bob })).status, 404);
  assert.equal((await request("/lessons/" + id + "/download")).status, 409);
  assert.equal(
    (
      await request("/lessons/" + id, {
        method: "PUT",
        body: { ...draft, title: "Updated water lesson" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/lessons", {
        method: "POST",
        body: {
          ...draft,
          scenes: [
            { ...draft.scenes[0], media_id: randomBytes(16).toString("hex") },
          ],
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/lessons/" + id, { method: "DELETE" })).status,
    200,
  );
  assert.equal((await request("/lessons/" + id)).status, 404);
});
test("customer institute API requires an eligible plan and data export includes new records", async () => {
  assert.equal((await request("/v1/lessons")).status, 402);
  const data = (await request("/account/export")).data;
  assert.ok(Array.isArray(data.lessons));
  assert.ok(data.knowledge.length > 0);
  assert.ok(Array.isArray(data.lesson_assets));
});

test("PDF extraction works on an actual text PDF", async () => {
  const stream =
    "BT /F1 12 Tf 30 700 Td (Sunlight provides energy for the water cycle and evaporation.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  const form = new FormData();
  form.append(
    "file",
    new Blob([pdf], { type: "application/pdf" }),
    "sunlight.pdf",
  );
  const r = await request("/knowledge", { method: "POST", form });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(r.data.characters > 40);
});
test("supporting images are decoded privately and cannot be attached or read by another account", async () => {
  const form = new FormData();
  form.append(
    "file",
    new Blob([readFileSync("public/realistic/milo.png")], {
      type: "image/png",
    }),
    "teacher-illustration.png",
  );
  const r = await request("/lesson-assets", { method: "POST", form });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const asset = r.data.asset;
  assert.equal(
    (await request("/lesson-assets/" + asset.id, { session: bob })).status,
    404,
  );
  const lesson = await request("/lessons", {
    method: "POST",
    body: { ...draft, scenes: [{ ...draft.scenes[0], media_id: asset.id }] },
  });
  assert.equal(lesson.status, 201);
  assert.equal(
    (
      await request("/lessons", {
        method: "POST",
        session: bob,
        body: {
          ...draft,
          scenes: [{ ...draft.scenes[0], media_id: asset.id }],
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/lesson-assets/" + asset.id, { method: "DELETE" })).status,
    409,
  );
  await request("/lessons/" + lesson.data.lesson.id, { method: "DELETE" });
  assert.equal(
    (await request("/lesson-assets/" + asset.id, { method: "DELETE" })).status,
    200,
  );
});
test("invalid supporting media is rejected with its inventory reservation refunded", async () => {
  const form = new FormData();
  form.append(
    "file",
    new Blob(["#EXTM3U\nhttp://127.0.0.1:3153/api/health\n"], {
      type: "video/mp4",
    }),
    "invalid.mp4",
  );
  const r = await request("/lesson-assets", { method: "POST", form });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  const db = new DatabaseSync(join(dir, "benai.sqlite"));
  try {
    assert.equal(
      db
        .prepare(
          "SELECT count FROM usage WHERE user_id=? AND period='inventory' AND kind='lesson_assets'",
        )
        .get(alice.user.id).count,
      0,
    );
  } finally {
    db.close();
  }
});
test("institute customer API creates lessons and answers lesson questions with scoped API keys", async () => {
  const db = new DatabaseSync(join(dir, "benai.sqlite"));
  try {
    const u = JSON.parse(
      db
        .prepare("SELECT body FROM documents WHERE collection='users' AND id=?")
        .get(alice.user.id).body,
    );
    u.plan = "business";
    db.prepare(
      "UPDATE documents SET body=? WHERE collection='users' AND id=?",
    ).run(JSON.stringify(u), alice.user.id);
  } finally {
    db.close();
  }
  const key = await request("/keys", {
    method: "POST",
    body: { name: "Institute LMS" },
  });
  assert.equal(key.status, 201, JSON.stringify(key.data));
  const headers = {
    Authorization: "Bearer " + key.data.key,
    "Content-Type": "application/json",
  };
  const create = await fetch(base + "/api/v1/lessons", {
    method: "POST",
    headers,
    body: JSON.stringify(draft),
  });
  assert.equal(create.status, 201);
  const { lesson } = await create.json();
  const ask = await fetch(base + "/api/v1/lessons/" + lesson.id + "/ask", {
    method: "POST",
    headers,
    body: JSON.stringify({ question: "Explain evaporation simply" }),
  });
  assert.equal(ask.status, 200, await ask.text());
  assert.ok(
    calls.at(-1).body.messages[0].content.includes("The sun warms water"),
  );
  const other = await request("/lessons/" + lesson.id + "/ask", {
    method: "POST",
    session: bob,
    body: { question: "Explain evaporation" },
  });
  assert.equal(other.status, 404);
});

test("AI lesson outlines accept valid model narrations and derive editable visual points", async () => {
  const r = await request("/lessons/generate", {
    method: "POST",
    body: { topic: "Water cycle for children", avatar_id: "elena" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.draft.scenes.length, 1);
  assert.match(r.data.draft.scenes[0].points[0], /warms water/);
});

test("public embeds cannot search private workspace documents", async () => {
  const embed = await request("/embeds", {
    method: "POST",
    body: { avatar_id: "elena" },
  });
  assert.equal(embed.status, 201);
  const r = await request("/embed/" + embed.data.id + "/chat", {
    method: "POST",
    session: null,
    body: { message: "Explain evaporation" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.sources, []);
  assert.ok(!calls.at(-1).body.messages[0].content.includes("solar energy"));
});
