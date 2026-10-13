import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("native Mongo storage: account persistence, sessions, atomic quotas, and message transactions", async () => {
  const repl = await MongoMemoryReplSet.create({
    binary: {
      version: "7.0.14",
      downloadDir:
        process.env.MONGOMS_DOWNLOAD_DIR || join(tmpdir(), "benai-mongo-bin"),
    },
    replSet: { count: 1 },
  });
  const dir = mkdtempSync(join(tmpdir(), "benai-mongo-"));
  const uri = repl.getUri();
  const { MongoClient } = await import("mongodb");
  const probe = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await probe.connect();
  await probe.db().command({ ping: 1 });
  await probe.close();
  const pass = randomBytes(16).toString("hex");
  let child;
  let errors = "";
  async function start() {
    child = spawn(process.execPath, ["server/index.js"], {
      env: {
        ...process.env,
        PORT: "3138",
        APP_URL: "http://127.0.0.1:3138",
        DATA_DIR: dir,
        MONGODB_URI: uri,
        MONGODB_DB: "benai_test",
        DEMO_MODE: "true",
        LOCAL_AI_URL: "",
        LOCAL_SPEECH_URL: "",
        STRIPE_SECRET_KEY: "",
        ADMIN_EMAIL: "",
        ADMIN_PASSWORD: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stderr.on("data", (b) => (errors += b.toString()));
    child.stdout.on("data", (b) => (errors += b.toString()));
    child.on("close", (code) => (errors += " Exit:" + code));
    for (let i = 0; i < 300; i++) {
      try {
        const r = await fetch("http://127.0.0.1:3138/api/health");
        if (r.ok) {
          assert.equal((await r.json()).storage, "mongodb");
          return;
        }
      } catch (e) {
        if (e.name === "AssertionError") throw e;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("Mongo-backed server did not start: " + errors);
  }
  async function stop() {
    child.kill("SIGTERM");
    await new Promise((r) => child.once("close", r));
    child = null;
  }
  try {
    await start();
    let r = await fetch("http://127.0.0.1:3138/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Mongo customer",
        email: "mongo@test.benai",
        password: pass,
      }),
    });
    assert.equal(r.status, 200);
    let cookie = r.headers.get("set-cookie").split(";")[0],
      data = await r.json();
    let headers = {
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": data.csrf,
    };
    r = await fetch("http://127.0.0.1:3138/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        avatar_id: "nova",
        message: "A message stored in MongoDB",
      }),
    });
    assert.equal(r.status, 200);
    const chat = await r.json();
    r = await fetch(
      "http://127.0.0.1:3138/api/conversations/" + chat.conversation_id,
      { headers },
    );
    assert.deepEqual(
      (await r.json()).messages.map((m) => m.role),
      ["user", "assistant"],
    );
    await stop();
    await start();
    r = await fetch("http://127.0.0.1:3138/api/auth/me", { headers });
    assert.equal(r.status, 200);
    data = await r.json();
    assert.equal(data.usage.messages, 1);
    assert.equal(data.user.email, "mongo@test.benai");
    const client = new MongoClient(uri);
    await client.connect();
    await client
      .db("benai_test")
      .collection("usage")
      .updateOne(
        { user_id: data.user.id, kind: "messages" },
        { $set: { count: 99 } },
      );
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        fetch("http://127.0.0.1:3138/api/chat", {
          method: "POST",
          headers,
          body: JSON.stringify({
            avatar_id: "nova",
            message: "Concurrent MongoDB quota request",
          }),
        }),
      ),
    );
    assert.deepEqual(results.map((x) => x.status).sort(), [200, 402, 402]);
    const concurrent = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        fetch("http://127.0.0.1:3138/api/avatars", {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: "Mongo avatar " + i,
            description: "Atomic inventory test",
            category: "Creative",
            prompt: "Be a concise and helpful AI assistant",
            image: "/avatars/nova.svg",
          }),
        }),
      ),
    );
    assert.deepEqual(
      concurrent.map((r) => r.status).sort(),
      [201, 201, 201, 402, 402, 402],
    );
    await client.close();
  } finally {
    if (child) await stop();
    await repl.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
