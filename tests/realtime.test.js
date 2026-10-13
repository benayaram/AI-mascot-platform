import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import WebSocket from "ws";
const enabled = process.env.BENAI_TEST_REALTIME === "1";
let child, session, bob;
const base = "http://127.0.0.1:3150",
  folder = mkdtempSync(join(tmpdir(), "benai-realtime-")),
  pass = randomBytes(16).toString("hex");
const sockets = new Set(),
  metrics = [];
async function open(options = {}) {
  const ws = new WebSocket(base.replace("http", "ws") + "/api/realtime", {
    headers: { Origin: base, Cookie: session.cookie, ...options },
  });
  sockets.add(ws);
  ws.events = [];
  ws.on("message", (raw) => ws.events.push(JSON.parse(raw)));
  ws.on("error", () => {});
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  await wait(ws, "ready");
  return ws;
}
async function wait(ws, type, predicate = () => true, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const i = ws.events.findIndex((x) => x.type === type && predicate(x));
    if (i >= 0) return ws.events.splice(i, 1)[0];
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("Missing realtime event: " + type);
}
async function register(email) {
  const r = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Voice pilot", email, password: pass }),
  });
  assert.equal(r.status, 200);
  const d = await r.json();
  return {
    cookie: r.headers.get("set-cookie").split(";")[0],
    csrf: d.csrf,
    id: d.user.id,
  };
}
before(async () => {
  if (!enabled) return;
  child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: "3150",
      APP_URL: base,
      DATA_DIR: folder,
      DEMO_MODE: "false",
      LOCAL_AI_URL: "http://127.0.0.1:8081/v1",
      LOCAL_SPEECH_URL: "http://127.0.0.1:8082",
      LOCAL_IMAGE_URL: "",
      LOCAL_PORTRAIT_URL: "",
      MONGODB_URI: "",
      ADMIN_EMAIL: "",
      ADMIN_PASSWORD: "",
      STRIPE_SECRET_KEY: "",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  session = await register("voice@test.benai");
  bob = await register("other@test.benai");
});
after(async () => {
  for (const ws of sockets) ws.terminate();
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((r) => child.once("close", r));
  }
  rmSync(folder, { recursive: true, force: true });
  if (enabled)
    writeFileSync(
      "/tmp/benai-v2-voice-metrics.json",
      JSON.stringify(metrics, null, 2),
    );
});
test(
  "realtime rejects anonymous and cross-origin connections",
  { skip: !enabled },
  async () => {
    for (const headers of [
      { Origin: base },
      { Origin: "https://evil.example", Cookie: session.cookie },
    ]) {
      const status = await new Promise((resolve) => {
        const ws = new WebSocket(base.replace("http", "ws") + "/api/realtime", {
          headers,
        });
        ws.on("error", () => {});
        ws.on("unexpected-response", (req, res) => {
          resolve(res.statusCode);
          res.resume();
          ws.terminate();
        });
      });
      assert.ok([401, 403].includes(status));
    }
  },
);
test(
  "real local model streams tokens, persists replies and returns playable speech",
  { skip: !enabled },
  async () => {
    const ws = await open();
    for (const question of [
      "What is two plus two? Answer briefly.",
      "Say hello in a short sentence.",
      "What is the capital of France? Answer briefly.",
    ]) {
      await new Promise((r) => setTimeout(r, 1100));
      ws.send(
        JSON.stringify({
          type: "turn",
          csrf: session.csrf,
          avatar_id: "amara",
          text: question,
        }),
      );
      const token = await wait(ws, "token");
      assert.ok(token.token);
      const reply = await wait(ws, "reply");
      assert.ok(reply.content.length > 1);
      const speech = await wait(ws, "audio");
      assert.equal(
        Buffer.from(speech.audio, "base64").subarray(0, 4).toString(),
        "RIFF",
      );
      const done = await wait(ws, "done");
      assert.ok(done.timing.first_token_ms < 15000);
      assert.ok(done.timing.audio_ready_ms < 20000);
      metrics.push(done.timing);
      const history = await (
        await fetch(base + "/api/conversations/" + reply.conversation_id, {
          headers: { Cookie: session.cookie },
        })
      ).json();
      assert.deepEqual(
        history.messages.map((m) => m.role),
        ["user", "assistant"],
      );
    }
    ws.close();
    await new Promise((r) => ws.once("close", r));
  },
);
test(
  "voice recordings travel over the own realtime channel through Whisper",
  { skip: !enabled },
  async () => {
    const audio = await (
      await fetch("http://127.0.0.1:8082/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello, how can you help me?",
          voice: "coral",
        }),
      })
    ).arrayBuffer();
    const ws = await open();
    ws.send(
      JSON.stringify({
        type: "turn",
        csrf: session.csrf,
        avatar_id: "amara",
        audio: Buffer.from(audio).toString("base64"),
      }),
    );
    const transcript = await wait(ws, "transcript");
    assert.match(transcript.text, /hello|help/i);
    await wait(ws, "audio");
    const done = await wait(ws, "done");
    assert.ok(done.timing.transcription_ms > 0);
    metrics.push(done.timing);
    ws.close();
    await new Promise((r) => ws.once("close", r));
  },
);
test(
  "interruption cancels in-flight inference and refunds an uncommitted turn",
  { skip: !enabled },
  async () => {
    const before = await (
      await fetch(base + "/api/auth/me", {
        headers: { Cookie: session.cookie },
      })
    ).json();
    const ws = await open();
    ws.send(
      JSON.stringify({
        type: "turn",
        csrf: session.csrf,
        avatar_id: "amara",
        text: "Explain how to build a solar system model in ten detailed steps.",
      }),
    );
    await wait(ws, "token");
    ws.send(JSON.stringify({ type: "interrupt" }));
    await wait(ws, "interrupted");
    await new Promise((r) => setTimeout(r, 500));
    const after = await (
      await fetch(base + "/api/auth/me", {
        headers: { Cookie: session.cookie },
      })
    ).json();
    assert.equal(after.usage.messages, before.usage.messages);
    assert.equal(after.usage.voice, before.usage.voice);
    ws.close();
    await new Promise((r) => ws.once("close", r));
  },
);
test(
  "CSRF and session revocation also protect an established voice socket",
  { skip: !enabled },
  async () => {
    const invalid = await open();
    invalid.send(
      JSON.stringify({
        type: "turn",
        csrf: "wrong",
        avatar_id: "amara",
        text: "Hi",
      }),
    );
    const code = await new Promise((r) => invalid.once("close", r));
    assert.equal(code, 1008);
    const ws = await open();
    await fetch(base + "/api/auth/logout", {
      method: "POST",
      headers: {
        Cookie: session.cookie,
        "X-CSRF-Token": session.csrf,
        "Content-Type": "application/json",
      },
    });
    ws.send(
      JSON.stringify({
        type: "turn",
        csrf: session.csrf,
        avatar_id: "amara",
        text: "Hi",
      }),
    );
    assert.equal(await new Promise((r) => ws.once("close", r)), 1008);
  },
);
