import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import WebSocket from "ws";
const dir = mkdtempSync(join(tmpdir(), "benai-v3-")),
  mail = join(dir, "mail"),
  pass = randomBytes(16).toString("hex"),
  apiKey = randomBytes(24).toString("hex"),
  base = "http://127.0.0.1:3141";
let child,
  fixture,
  alice,
  bob,
  admin,
  providerCalls = [],
  providerFailure = false,
  gpu = false,
  videoBytes,
  wav,
  demo;
function documents(collection) {
  const db = new DatabaseSync(join(dir, "benai.sqlite"));
  try {
    return db
      .prepare("SELECT body FROM documents WHERE collection=?")
      .all(collection)
      .map((r) => JSON.parse(r.body));
  } finally {
    db.close();
  }
}
async function request(
  path,
  { method = "GET", body, session = alice, binary = false } = {},
) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(session
        ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: binary ? Buffer.from(await r.arrayBuffer()) : await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function register(email, name = "V3 tester", referral) {
  const r = await request("/auth/register", {
    method: "POST",
    session: null,
    body: { name, email, password: pass, ...(referral ? { referral } : {}) },
  });
  assert.equal(r.status, 200);
  return { cookie: r.cookie, csrf: r.data.csrf, user: r.data.user };
}
async function choose(overrides) {
  const current = (await request("/provider-settings")).data.settings;
  const r = await request("/provider-settings", {
    method: "PUT",
    body: {
      tts: current.tts,
      video: current.video,
      compute: current.compute,
      quality: current.quality,
      ...overrides,
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
}
function mailToken(email, purpose) {
  const message = readdirSync(mail)
    .map((n) => JSON.parse(readFileSync(join(mail, n))))
    .filter(
      (m) =>
        m.to === email &&
        m.subject.includes(purpose === "reset" ? "Reset" : "Verify"),
    )
    .at(-1);
  assert.ok(message);
  return message.text.match(/token=([a-f0-9]{64})/)[1];
}
before(async () => {
  const samples = Buffer.alloc(24000);
  for (let i = 0; i < 12000; i++)
    samples.writeInt16LE(Math.round(Math.sin(i * 0.08) * 1000), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(samples.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length, 40);
  wav = Buffer.concat([header, samples]);
  const mp4 = join(dir, "fixture.mp4");
  const rendered = spawnSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=purple:s=64x64:d=0.5",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-pix_fmt",
    "yuv420p",
    mp4,
  ]);
  assert.equal(rendered.status, 0, rendered.stderr.toString());
  videoBytes = readFileSync(mp4);
  fixture = createServer(async (req, res) => {
    let raw = "";
    for await (const b of req) raw += b;
    const body = raw ? JSON.parse(raw) : null;
    providerCalls.push({ path: req.url, body, headers: req.headers });
    res.setHeader("Content-Type", "application/json");
    if (providerFailure) {
      res.writeHead(429);
      res.end(JSON.stringify({ error: "untrusted provider body " + apiKey }));
      return;
    }
    if (req.url === "/health") {
      res.end(
        JSON.stringify({
          status: "ok",
          device: "cpu",
          devices: gpu ? ["cpu", "cuda"] : ["cpu"],
          fast_portraits: true,
        }),
      );
      return;
    }
    if (req.url === "/v1/chat/completions") {
      if (body.stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.end(
          "data: " +
            JSON.stringify({
              choices: [{ delta: { content: "Hello from our assistant." } }],
            }) +
            "\n\ndata: [DONE]\n\n",
        );
      } else
        res.end(
          JSON.stringify({
            choices: [{ message: { content: "Hello from our assistant." } }],
          }),
        );
      return;
    }
    if (req.url === "/v1beta/models") {
      res.end(
        JSON.stringify({ models: [{ name: "models/gemini-3.8-flash-tts" }] }),
      );
      return;
    }
    if (req.url === "/v1/models") {
      res.end(JSON.stringify({ data: [{ id: "gpt-4o-mini-tts" }] }));
      return;
    }
    if (req.url === "/v1/voices") {
      res.end(
        JSON.stringify({
          voices: [{ voice_id: "voice-1", name: "Fixture voice" }],
        }),
      );
      return;
    }
    if (req.url === "/v2/avatars") {
      res.end(
        JSON.stringify({
          data: {
            avatars: [{ avatar_id: "avatar-1", avatar_name: "Fixture avatar" }],
          },
        }),
      );
      return;
    }
    if (req.url === "/v2/voices") {
      res.end(
        JSON.stringify({
          data: { voices: [{ voice_id: "voice-1", name: "Fixture voice" }] },
        }),
      );
      return;
    }
    if (req.url === "/v1beta/interactions") {
      if (body.stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.write(
          "data: " +
            JSON.stringify({
              event_type: "step.delta",
              delta: {
                type: "audio",
                data: samples.subarray(0, 12000).toString("base64"),
              },
            }) +
            "\n\n",
        );
        setTimeout(
          () =>
            res.end(
              "data: " +
                JSON.stringify({
                  event_type: "step.delta",
                  delta: {
                    type: "audio",
                    data: samples.subarray(12000).toString("base64"),
                  },
                }) +
                "\n\n",
            ),
          20,
        );
        return;
      }
      res.end(
        JSON.stringify({
          steps: [
            {
              type: "model_output",
              content: [
                {
                  type: "audio",
                  data: wav.toString("base64"),
                  mime_type: "audio/wav",
                },
              ],
            },
          ],
        }),
      );
      return;
    }
    if (
      req.url === "/v1/audio/speech" ||
      req.url.startsWith("/v1/text-to-speech/")
    ) {
      res.setHeader("Content-Type", "audio/wav");
      res.end(req.url.startsWith("/v1/text-to-speech/") ? samples : wav);
      return;
    }
    if (req.url === "/v2/video/generate") {
      res.end(JSON.stringify({ data: { video_id: "provider-job-1" } }));
      return;
    }
    if (req.url.startsWith("/v1/video_status.get")) {
      res.end(
        JSON.stringify({
          data: {
            status: "completed",
            video_url: "http://127.0.0.1:3142/media/video.mp4",
            duration: 0.5,
          },
        }),
      );
      return;
    }
    if (req.url === "/media/video.mp4") {
      res.setHeader("Content-Type", "video/mp4");
      res.end(videoBytes);
      return;
    }
    if (req.url === "/render" || req.url === "/render-fast") {
      res.end(
        JSON.stringify({
          video: videoBytes.toString("base64"),
          duration: 0.5,
          render_ms: 20,
          fps: 24,
          model: "fixture",
          device: body.compute === "gpu" ? "cuda" : "cpu",
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end("{}");
  });
  await new Promise((r) => fixture.listen(3142, "127.0.0.1", r));
  child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: "3141",
      APP_URL: base,
      DATA_DIR: dir,
      MAIL_CAPTURE_DIR: mail,
      SMTP_HOST: "",
      MONGODB_URI: "",
      DEMO_MODE: "true",
      LOCAL_AI_URL: "http://127.0.0.1:3142/v1",
      LOCAL_SPEECH_URL: "",
      LOCAL_IMAGE_URL: "",
      LOCAL_PORTRAIT_URL: "http://127.0.0.1:3142",
      GPU_PORTRAIT_URL: "http://127.0.0.1:3142",
      BENAI_PROVIDER_FIXTURE_URL: "http://127.0.0.1:3142",
      ADMIN_EMAIL: "admin@v3.benai",
      ADMIN_PASSWORD: pass,
      STRIPE_SECRET_KEY: "",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let errors = "";
  child.stderr.on("data", (b) => (errors += b));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw Error(errors);
  }
  alice = await register("alice@v3.benai");
  bob = await register("bob@v3.benai");
  const a = await request("/auth/login", {
    method: "POST",
    session: null,
    body: { email: "admin@v3.benai", password: pass },
  });
  admin = { cookie: a.cookie, csrf: a.data.csrf, user: a.data.user };
});
after(async () => {
  if (child?.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((r) => child.once("close", r));
  }
  fixture?.closeAllConnections();
  await new Promise((r) => fixture.close(r));
  rmSync(dir, { recursive: true, force: true });
});
test("shared-IP read bursts do not exhaust the mutation budget", async () => {
  for (let i = 0; i < 10; i++) {
    const reads = await Promise.all(
      Array.from({ length: 20 }, () => request("/health", { session: null })),
    );
    assert.ok(reads.every((r) => r.status === 200));
  }
  await choose({
    tts: "local",
    video: "local",
    compute: "cpu",
    quality: "fast",
  });
});
test("customer credentials are encrypted, private, CSRF protected, and never exported", async () => {
  assert.equal(
    (
      await request("/provider-credentials/gemini", {
        method: "PUT",
        session: { ...alice, csrf: "bad" },
        body: { key: apiKey },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/provider-credentials/gemini", {
        method: "PUT",
        body: { key: apiKey, model: "gemini-3.8-flash-tts", voice: "Kore" },
      })
    ).status,
    200,
  );
  const rows = documents("provider_credentials");
  assert.equal(rows.length, 1);
  assert.ok(rows[0].ciphertext);
  assert.ok(!JSON.stringify(rows).includes(apiKey));
  assert.ok(
    !JSON.stringify((await request("/provider-settings")).data).includes(
      apiKey,
    ),
  );
  assert.equal(
    (await request("/provider-settings", { session: bob })).data.credentials
      .length,
    0,
  );
  assert.equal(
    (
      await request("/provider-credentials/gemini/test", {
        method: "POST",
        session: bob,
      })
    ).status,
    400,
  );
  const exported = (await request("/account/export")).data;
  assert.ok(!JSON.stringify(exported).includes(apiKey));
  assert.equal(exported.user.password, undefined);
});
test("encrypted provider keys cannot be transplanted into another account", async () => {
  const original = documents("provider_credentials")[0],
    id = bob.user.id + ":gemini",
    db = new DatabaseSync(join(dir, "benai.sqlite"));
  db.prepare("INSERT INTO documents VALUES(?,?,?)").run(
    "provider_credentials",
    id,
    JSON.stringify({ ...original, id, user_id: bob.user.id }),
  );
  db.close();
  const result = await request("/provider-credentials/gemini/test", {
    method: "POST",
    session: bob,
  });
  assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result.data).includes(apiKey));
  await request("/provider-credentials/gemini", {
    method: "DELETE",
    session: bob,
  });
});
test("external video media URLs refuse private hosts, credentials, HTTP and misleading domains", async () => {
  const { safeMediaUrl } = await import("../server/provider-security.js");
  for (const value of [
    "http://api.heygen.com/file",
    "https://127.0.0.1/file",
    "https://user:password@api.heygen.com/file",
    "https://heygen.com.evil.example/file",
    "https://api.heygen.com:8080/file",
  ])
    assert.throws(() => safeMediaUrl(value));
  assert.equal(
    safeMediaUrl("https://cdn.heygen.com/video.mp4").hostname,
    "cdn.heygen.com",
  );
});
test("concurrent uploads obey the storage budget and owner deletion frees one slot", async () => {
  const owner = await register("storage@v3.benai"),
    sharp = (await import("sharp")).default,
    image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#aabbcc" },
    })
      .png()
      .toBuffer();
  const upload = () => {
    const form = new FormData();
    form.append(
      "image",
      new Blob([image], { type: "image/png" }),
      "portrait.png",
    );
    return fetch(base + "/api/uploads", {
      method: "POST",
      headers: { Cookie: owner.cookie, "X-CSRF-Token": owner.csrf },
      body: form,
    });
  };
  const responses = await Promise.all(Array.from({ length: 13 }, upload));
  assert.deepEqual(responses.map((r) => r.status).sort(), [
    ...Array(12).fill(201),
    402,
  ]);
  const saved = (await request("/assets", { session: owner })).data.assets[0];
  assert.equal(
    (await request("/assets/" + saved.id, { method: "DELETE", session: bob }))
      .status,
    404,
  );
  assert.equal(
    (await request("/assets/" + saved.id, { method: "DELETE", session: owner }))
      .status,
    200,
  );
  assert.equal((await upload()).status, 201);
});
test("Gemini 3.8, OpenAI and ElevenLabs use the documented requests and return playable WAV", async () => {
  for (const [provider, model, voice] of [
    ["gemini", "gemini-3.8-flash-tts", "Kore"],
    ["openai", "gpt-4o-mini-tts", "coral"],
    ["elevenlabs", "eleven_flash_v2_5", "voice-1"],
  ]) {
    assert.equal(
      (
        await request("/provider-credentials/" + provider, {
          method: "PUT",
          body: { key: apiKey, model, voice },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/provider-credentials/" + provider + "/test", {
          method: "POST",
        })
      ).status,
      200,
    );
    await choose({ tts: provider });
    const r = await request("/tts", {
      method: "POST",
      body: { text: "Hello from BENAI" },
      binary: true,
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.subarray(0, 4).toString(), "RIFF");
  }
  const gem = providerCalls.find((c) => c.path === "/v1beta/interactions");
  assert.equal(gem.body.model, "gemini-3.8-flash-tts");
  assert.deepEqual(gem.body.generation_config.speech_config, [
    { voice: "Kore" },
  ]);
  assert.equal(gem.headers["x-goog-api-key"], apiKey);
  const open = providerCalls.find((c) => c.path === "/v1/audio/speech");
  assert.equal(open.body.response_format, "wav");
  assert.equal(open.headers.authorization, "Bearer " + apiKey);
});
test("Gemini 3.8 streams audio chunks over the authenticated BENAI channel without exposing the key", async () => {
  await choose({ tts: "gemini" });
  const events = [],
    ws = new WebSocket(base.replace("http", "ws") + "/api/realtime", {
      headers: { Origin: base, Cookie: alice.cookie },
    });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error("Socket timeout")), 5000);
    ws.on("error", reject);
    ws.on("message", (bytes) => {
      const d = JSON.parse(bytes);
      events.push(d);
      if (d.type === "ready")
        ws.send(
          JSON.stringify({
            type: "turn",
            csrf: alice.csrf,
            avatar_id: "amara",
            text: "Say hello",
            speak: true,
          }),
        );
      if (d.type === "error") {
        clearTimeout(timeout);
        reject(Error(d.error));
      }
      if (d.type === "done") {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  ws.close();
  const audio = events.filter((e) => e.type === "audio");
  assert.equal(audio.length, 2);
  assert.ok(audio.every((e) => e.streamed));
  assert.ok(
    audio.every(
      (e) =>
        Buffer.from(e.audio, "base64").subarray(0, 4).toString() === "RIFF",
    ),
  );
  assert.ok(!JSON.stringify(events).includes(apiKey));
  assert.ok(
    events.find((e) => e.type === "done").timing.audio_first_chunk_ms >= 0,
  );
  await choose({ tts: "elevenlabs" });
});
test("provider errors are sanitized, usage is refunded, and deleting a key resets selection", async () => {
  const before = (await request("/auth/me")).data.usage.voice;
  providerFailure = true;
  const r = await request("/tts", {
    method: "POST",
    body: { text: "Provider failure" },
  });
  assert.equal(r.status, 429);
  assert.ok(!JSON.stringify(r.data).includes(apiKey));
  providerFailure = false;
  assert.equal((await request("/auth/me")).data.usage.voice, before);
  await request("/provider-credentials/elevenlabs", { method: "DELETE" });
  assert.equal(
    (await request("/provider-settings")).data.settings.tts,
    "local",
  );
});
test("GPU switching refuses unavailable hardware and routes only to a verified CUDA worker", async () => {
  const unavailable = await request("/provider-settings", {
    method: "PUT",
    body: { tts: "local", video: "local", compute: "gpu", quality: "neural" },
  });
  assert.equal(unavailable.status, 503);
  gpu = true;
  await choose({ compute: "gpu", quality: "neural", tts: "openai" });
  const job = await request("/videos", {
    method: "POST",
    body: { avatar_id: "amara", script: "GPU routing contract test" },
  });
  assert.equal(job.status, 202);
  let result;
  for (let i = 0; i < 50; i++) {
    result = (await request("/videos/" + job.data.id)).data.video;
    if (result.status !== "processing") break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(result.status, "completed", result.error);
  assert.equal(result.device, "cuda");
  assert.equal(
    providerCalls.find((c) => c.path === "/render").body.compute,
    "gpu",
  );
  gpu = false;
  await choose({ compute: "cpu", quality: "fast" });
});
test("HeyGen jobs are polled, stored privately, and downloads stay account scoped", async () => {
  await request("/provider-credentials/heygen", {
    method: "PUT",
    session: admin,
    body: { key: apiKey, avatar_id: "avatar-1", voice: "voice-1" },
  });
  await request("/provider-settings", {
    method: "PUT",
    session: admin,
    body: { tts: "local", video: "heygen", compute: "cpu", quality: "fast" },
  });
  const created = await request("/videos", {
    method: "POST",
    session: admin,
    body: { avatar_id: "amara", script: "Hello from the provider" },
  });
  assert.equal(created.status, 202);
  let job;
  for (let i = 0; i < 50; i++) {
    job = (await request("/videos/" + created.data.id, { session: admin })).data
      .video;
    if (job.status !== "processing") break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(job.status, "completed", job.error);
  assert.equal(job.external_id, "provider-job-1");
  assert.equal(
    (await request(job.url.replace("/api", ""), { session: bob, binary: true }))
      .status,
    404,
  );
  assert.equal(
    (
      await request(job.url.replace("/api", ""), {
        session: admin,
        binary: true,
      })
    ).data
      .subarray(4, 8)
      .toString(),
    "ftyp",
  );
  const call = providerCalls.find((c) => c.path === "/v2/video/generate");
  assert.equal(call.body.video_inputs[0].voice.voice_id, "voice-1");
});
test("verified emails use hashed, expiring, single-use tokens", async () => {
  const token = mailToken(alice.user.email, "verify");
  assert.ok(!JSON.stringify(documents("account_tokens")).includes(token));
  assert.equal(
    (await request("/auth/verify-email", { method: "POST", body: { token } }))
      .status,
    200,
  );
  assert.equal(
    (await request("/auth/verify-email", { method: "POST", body: { token } }))
      .status,
    400,
  );
  assert.equal((await request("/auth/me")).data.user.email_verified, true);
});
test("templates ground assistants in business facts; demos collect consented private leads and referral attribution", async () => {
  const created = await request("/templates/local-business/use", {
    method: "POST",
    body: {
      name: "Our business",
      facts:
        "Our cafe opens at 9am and closes at 5pm. Contact cafe@example.com.",
    },
  });
  assert.equal(created.status, 201);
  assert.ok(created.data.avatar.knowledge_text.includes("9am"));
  const pub = await request("/demos", {
    method: "POST",
    body: {
      avatar_id: created.data.avatar.id,
      title: "Our cafe demo",
      description: "Ask about opening hours",
      accept_public: true,
    },
  });
  assert.equal(pub.status, 201);
  demo = pub.data.demo;
  const visitor = randomBytes(12).toString("hex");
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await request("/public-demo/" + demo.id + "/visit", {
          method: "POST",
          session: null,
          body: { visitor },
        })
      ).status,
      200,
    );
  assert.equal(
    (
      await request("/public-demo/" + demo.id + "/leads", {
        method: "POST",
        session: null,
        body: {
          name: "Interested visitor",
          email: "lead@v3.benai",
          consent: false,
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/public-demo/" + demo.id + "/leads", {
        method: "POST",
        session: null,
        body: {
          name: "Interested visitor",
          email: "lead@v3.benai",
          message: "Please send opening hours",
          consent: true,
        },
      })
    ).status,
    201,
  );
  const chat = await request("/public-demo/" + demo.id + "/chat", {
    method: "POST",
    session: null,
    body: { message: "When do you open?" },
  });
  assert.equal(chat.status, 200);
  const growth = (await request("/growth")).data;
  assert.equal(growth.stats.visitors, 1);
  assert.equal(growth.stats.turns, 1);
  assert.equal(growth.stats.leads, 1);
  assert.equal(
    (await request("/growth", { session: bob })).data.leads.length,
    0,
  );
  const ref = new URL(growth.referral_url).searchParams.get("ref");
  await register("referred@v3.benai", "Referred visitor", ref);
  assert.equal((await request("/growth")).data.stats.referred_signups, 1);
  await request("/demos/" + demo.id, { method: "DELETE" });
  assert.equal(
    (await request("/public-demo/" + demo.id, { session: null })).status,
    404,
  );
});
test("offline backup restores records, private media and encryption key; tampering is rejected", async () => {
  const destination = mkdtempSync(join(tmpdir(), "benai-v3-backup-")),
    restored = join(dir, "restored");
  const env = {
    ...process.env,
    DATA_DIR: dir,
    APP_URL: "http://127.0.0.1:3999",
    MONGODB_URI: "",
    NODE_ENV: "test",
  };
  let r = spawnSync(
    process.execPath,
    ["scripts/backup.js", "backup", destination],
    { env, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  r = spawnSync(
    process.execPath,
    ["scripts/backup.js", "restore", destination, "--confirm-restore=BENAI"],
    { env: { ...env, DATA_DIR: restored }, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  const db = new DatabaseSync(join(restored, "benai.sqlite"));
  assert.ok(
    db
      .prepare(
        "SELECT count(*) n FROM documents WHERE collection='provider_credentials'",
      )
      .get().n > 0,
  );
  db.close();
  assert.deepEqual(
    readFileSync(join(restored, ".provider-master-key")),
    readFileSync(join(dir, ".provider-master-key")),
  );
  writeFileSync(join(destination, "snapshot.json"), "tampered");
  r = spawnSync(
    process.execPath,
    ["scripts/backup.js", "verify", destination],
    { env, encoding: "utf8" },
  );
  assert.notEqual(r.status, 0);
  rmSync(destination, { recursive: true, force: true });
});
test("password recovery is single-use and revokes existing sessions", async () => {
  const unknown = await request("/auth/forgot-password", {
    method: "POST",
    session: null,
    body: { email: "unknown@v3.benai" },
  });
  assert.equal(unknown.status, 200);
  const requested = await request("/auth/forgot-password", {
    method: "POST",
    session: null,
    body: { email: bob.user.email },
  });
  assert.deepEqual(requested.data, unknown.data);
  const token = mailToken(bob.user.email, "reset"),
    newPassword = randomBytes(16).toString("hex");
  const attempts = await Promise.all(
    [1, 2].map(() =>
      request("/auth/reset-password", {
        method: "POST",
        session: null,
        body: { token, password: newPassword },
      }),
    ),
  );
  assert.deepEqual(attempts.map((x) => x.status).sort(), [200, 400]);
  assert.equal((await request("/auth/me", { session: bob })).status, 401);
});
test("account deletion requires reauthentication and removes credentials, usage, demos and sessions", async () => {
  assert.equal(
    (
      await request("/account", {
        method: "DELETE",
        body: { password: "wrong", confirmation: "DELETE" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/account", {
        method: "DELETE",
        body: { password: pass, confirmation: "DELETE" },
      })
    ).status,
    200,
  );
  assert.equal((await request("/auth/me")).status, 401);
  assert.equal(
    documents("provider_credentials").filter((c) => c.user_id === alice.user.id)
      .length,
    0,
  );
  const db = new DatabaseSync(join(dir, "benai.sqlite"));
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM usage WHERE user_id=?")
      .get(alice.user.id).n,
    0,
  );
  db.close();
});
