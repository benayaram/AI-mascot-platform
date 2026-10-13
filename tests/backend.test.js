import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
const dir = mkdtempSync(join(tmpdir(), "benai-test-")),
  port = 3127,
  base = `http://127.0.0.1:${port}`,
  pass = randomBytes(16).toString("hex");
let child, admin, alice, bob, key, conversation, embed;
async function request(
  path,
  { method = "GET", body, session, headers = {} } = {},
) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(session
        ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf }
        : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  return {
    status: r.status,
    data,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function login(email) {
  const r = await request("/auth/login", {
    method: "POST",
    body: { email, password: pass },
  });
  assert.equal(r.status, 200);
  return { cookie: r.cookie, csrf: r.data.csrf, user: r.data.user };
}
before(async () => {
  child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      APP_URL: base,
      DATA_DIR: dir,
      DEMO_MODE: "true",
      LOCAL_AI_URL: "",
      LOCAL_SPEECH_URL: "",
      LOCAL_IMAGE_URL: "",
      AI_PROVIDER_KEY: "",
      OPENAI_API_KEY: "",
      MONGODB_URI: "",
      STRIPE_SECRET_KEY: "",
      HEYGEN_API_KEY: "",
      ADMIN_EMAIL: "admin@test.benai",
      ADMIN_PASSWORD: pass,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let failure = "";
  child.stderr.on("data", (b) => {
    failure += b;
  });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + "/api/health");
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw Error("Server failed: " + failure);
  }
  admin = await login("admin@test.benai");
  for (const [name, email] of [
    ["Alice", "alice@test.benai"],
    ["Bob", "bob@test.benai"],
  ]) {
    const r = await request("/auth/register", {
      method: "POST",
      body: { name, email, password: pass },
    });
    assert.equal(r.status, 200);
    const s = { cookie: r.cookie, csrf: r.data.csrf, user: r.data.user };
    if (name === "Alice") alice = s;
    else bob = s;
  }
});
after(async () => {
  child?.kill("SIGTERM");
  if (child && child.exitCode === null)
    await new Promise((r) => child.once("close", r));
  rmSync(dir, { recursive: true, force: true });
});
test("password validation, login failures, and sanitized account data", async () => {
  assert.equal(
    (
      await request("/auth/register", {
        method: "POST",
        body: { name: "Bad", email: "bad@test.benai", password: "weak" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        body: { email: "alice@test.benai", password: "wrong" },
      })
    ).status,
    401,
  );
  const r = await request("/auth/me", { session: alice });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.password, undefined);
  assert.equal(r.data.user.role, "customer");
});
test("CSRF protection and role-based administrative access", async () => {
  assert.equal(
    (
      await request("/keys", {
        method: "POST",
        session: { ...alice, csrf: "invalid" },
        body: { name: "Key" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/admin/overview", { session: alice })).status,
    403,
  );
  const r = await request("/admin/overview", { session: admin });
  assert.equal(r.status, 200);
  assert.equal(r.data.users.length, 3);
  assert.ok(r.data.users.every((u) => !u.password));
  assert.equal(
    (
      await request("/admin/users/" + alice.user.id, {
        method: "PATCH",
        session: alice,
        body: { role: "admin" },
      })
    ).status,
    403,
  );
});
test("six original presets and private avatar ownership", async () => {
  assert.equal(
    (await request("/avatars", { session: alice })).data.avatars.length,
    9,
  );
  const r = await request("/avatars", {
    method: "POST",
    session: alice,
    body: {
      name: "Private guide",
      description: "A custom private assistant",
      category: "Support",
      prompt: "You are a thoughtful guide. Be precise and helpful.",
      image: "/avatars/atlas.svg",
      public: false,
    },
  });
  assert.equal(r.status, 201);
  const id = r.data.avatar.id;
  assert.ok(
    !(await request("/avatars", { session: bob })).data.avatars.some(
      (a) => a.id === id,
    ),
  );
  assert.equal(
    (
      await request("/chat", {
        method: "POST",
        session: bob,
        body: { avatar_id: id, message: "Hello" },
      })
    ).status,
    404,
  );
  assert.equal(
    (await request("/avatars/" + id, { method: "DELETE", session: bob }))
      .status,
    404,
  );
  assert.equal(
    (
      await request("/avatars", {
        method: "POST",
        session: alice,
        body: {
          name: "Malicious",
          description: "No publication",
          category: "Support",
          prompt: "Be a helpful assistant",
          image: "/avatars/atlas.svg",
          public: true,
        },
      })
    ).status,
    403,
  );
});
test("conversations persist, maintain message order, and isolate users", async () => {
  const r = await request("/chat", {
    method: "POST",
    session: alice,
    body: { avatar_id: "nova", message: "Hello there" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.demo, true);
  conversation = r.data.conversation_id;
  const saved = await request("/conversations/" + conversation, {
    session: alice,
  });
  assert.deepEqual(
    saved.data.messages.map((m) => m.role),
    ["user", "assistant"],
  );
  assert.equal(
    (await request("/conversations/" + conversation, { session: bob })).status,
    404,
  );
  assert.equal(
    (
      await request("/chat", {
        method: "POST",
        session: bob,
        body: {
          avatar_id: "nova",
          message: "Spy",
          conversation_id: conversation,
        },
      })
    ).status,
    404,
  );
  assert.equal(
    (await request("/auth/me", { session: alice })).data.usage.messages,
    1,
  );
});
test("free accounts cannot create API keys; administrators can grant paid access", async () => {
  assert.equal(
    (
      await request("/keys", {
        method: "POST",
        session: alice,
        body: { name: "My API" },
      })
    ).status,
    402,
  );
  assert.equal(
    (
      await request("/admin/users/" + alice.user.id, {
        method: "PATCH",
        session: admin,
        body: { plan: "pro" },
      })
    ).status,
    200,
  );
  const r = await request("/keys", {
    method: "POST",
    session: alice,
    body: { name: "My API" },
  });
  assert.equal(r.status, 201);
  key = r.data;
  assert.ok(key.key.startsWith("ps_"));
  const list = await request("/keys", { session: alice });
  assert.equal(list.data.keys[0].hash, undefined);
  assert.equal(list.data.keys[0].key, undefined);
  const chat = await request("/v1/chat", {
    method: "POST",
    headers: { Authorization: "Bearer " + key.key },
    body: { avatar_id: "nova", message: "An API message" },
  });
  assert.equal(chat.status, 200);
  assert.equal(
    (
      await request("/v1/avatars", {
        headers: { Authorization: "Bearer invalid" },
      })
    ).status,
    401,
  );
});
test("public widgets work without account cookies, stay scoped, and can be revoked", async () => {
  const r = await request("/embeds", {
    method: "POST",
    session: alice,
    body: { avatar_id: "nova" },
  });
  assert.equal(r.status, 201);
  embed = r.data.id;
  assert.ok(r.data.code.includes("/widget/"));
  const info = await request("/embed/" + embed);
  assert.equal(info.status, 200);
  assert.equal(info.data.avatar.prompt, undefined);
  const response = await request("/embed/" + embed + "/chat", {
    method: "POST",
    body: { message: "Hello" },
  });
  assert.equal(response.status, 200);
  assert.equal(
    (await request("/embeds/" + embed, { method: "DELETE", session: bob }))
      .status,
    200,
  );
  assert.equal((await request("/embed/" + embed)).status, 200);
  await request("/embeds/" + embed, { method: "DELETE", session: alice });
  assert.equal((await request("/embed/" + embed)).status, 404);
});
test("unconfigured paid services fail clearly and do not charge usage", async () => {
  const before = (await request("/auth/me", { session: alice })).data.usage;
  assert.equal(
    (
      await request("/tts", {
        method: "POST",
        session: alice,
        body: { text: "Hello there" },
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await request("/videos", {
        method: "POST",
        session: alice,
        body: { avatar_id: "nova", script: "Hello, welcome to BENAI." },
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await request("/billing/checkout", {
        method: "POST",
        session: alice,
        body: { plan: "pro" },
      })
    ).status,
    503,
  );
  const after = (await request("/auth/me", { session: alice })).data.usage;
  assert.deepEqual(before, after);
});
test("free illustration generation returns an actual PNG and records usage", async () => {
  const r = await request("/avatars/generate", {
    method: "POST",
    session: alice,
    body: { prompt: "A friendly purple robot with a big smile" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.procedural, true);
  const file = await fetch(base + r.data.image, {
    headers: { Cookie: alice.cookie },
  });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "image/png");
  assert.equal(
    (await request("/auth/me", { session: alice })).data.usage.images,
    1,
  );
});
test("server rejects cross-origin mutation, and invalid Stripe signatures are not accepted", async () => {
  assert.equal(
    (
      await request("/chat", {
        method: "POST",
        session: alice,
        headers: { Origin: "https://evil.example" },
        body: { avatar_id: "nova", message: "Bad origin" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/billing/webhook", {
        method: "POST",
        body: { type: "customer.subscription.updated" },
      })
    ).status,
    503,
  );
});
test("monthly message limits are atomic under concurrent requests", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(join(dir, "benai.sqlite"));
  const period = new Date().toISOString().slice(0, 7);
  db.prepare("INSERT OR REPLACE INTO usage VALUES (?,?,?,?)").run(
    bob.user.id,
    period,
    "messages",
    99,
  );
  db.close();
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      request("/chat", {
        method: "POST",
        session: bob,
        body: { avatar_id: "nova", message: "Last allowed message" },
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 402).length, 2);
  assert.equal(
    (await request("/auth/me", { session: bob })).data.usage.messages,
    100,
  );
});
test("revoking keys and logging out invalidates access immediately", async () => {
  await request("/keys/" + key.id, { method: "DELETE", session: alice });
  assert.equal(
    (
      await request("/v1/avatars", {
        headers: { Authorization: "Bearer " + key.key },
      })
    ).status,
    401,
  );
  assert.equal(
    (await request("/auth/logout", { method: "POST", session: alice })).status,
    200,
  );
  assert.equal((await request("/auth/me", { session: alice })).status, 401);
});

test("realistic avatars require explicit portrait permission", async () => {
  const r = await request("/avatars", {
    method: "POST",
    session: bob,
    body: {
      name: "Human guide",
      description: "A realistic AI host",
      category: "Companion",
      prompt: "You are a concise and helpful AI host.",
      image: "/realistic/amara.png",
      kind: "realistic",
      rights_confirmed: false,
    },
  });
  assert.equal(r.status, 400);
});
test("private portrait media and reuse are isolated across accounts", async () => {
  const sharp = (await import("sharp")).default;
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#9876de" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append("image", new Blob([png], { type: "image/png" }), "private.png");
  const r = await fetch(base + "/api/uploads", {
    method: "POST",
    headers: { Cookie: bob.cookie, "X-CSRF-Token": bob.csrf },
    body: form,
  });
  assert.equal(r.status, 201);
  const { image } = await r.json();
  assert.equal((await fetch(base + image)).status, 404);
  assert.equal(
    (await fetch(base + image, { headers: { Cookie: bob.cookie } })).status,
    200,
  );
  assert.equal(
    (await fetch(base + image, { headers: { Cookie: admin.cookie } })).status,
    200,
  );
  const create = await request("/avatars", {
    method: "POST",
    session: admin,
    body: {
      name: "Admin image",
      description: "A permitted admin inspection",
      category: "Creative",
      prompt: "Be a helpful and honest AI assistant",
      image,
    },
  });
  assert.equal(create.status, 201);
  const other = await registerTestUser("privacy");
  assert.equal(
    (await fetch(base + image, { headers: { Cookie: other.cookie } })).status,
    404,
  );
  assert.equal(
    (
      await request("/avatars", {
        method: "POST",
        session: other,
        body: {
          name: "Copied photo",
          description: "Not the image owner",
          category: "Creative",
          prompt: "Be a helpful and honest AI assistant",
          image,
        },
      })
    ).status,
    403,
  );
});
async function registerTestUser(prefix) {
  const r = await request("/auth/register", {
    method: "POST",
    body: { name: "QC customer", email: prefix + "@qc.benai", password: pass },
  });
  assert.equal(r.status, 200);
  return { cookie: r.cookie, csrf: r.data.csrf, user: r.data.user };
}
test("avatar inventory caps hold under simultaneous create requests", async () => {
  const user = await registerTestUser("inventory");
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      request("/avatars", {
        method: "POST",
        session: user,
        body: {
          name: "Character " + i,
          description: "Concurrency quota validation",
          category: "Creative",
          prompt: "You are a concise and helpful AI guide",
          image: "/avatars/nova.svg",
        },
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 3);
  assert.equal(results.filter((r) => r.status === 402).length, 3);
});
test("corrupt image bytes are rejected before becoming stored media", async () => {
  const body = new FormData();
  body.append(
    "image",
    new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])], {
      type: "image/png",
    }),
    "broken.png",
  );
  const r = await fetch(base + "/api/uploads", {
    method: "POST",
    headers: { Cookie: bob.cookie, "X-CSRF-Token": bob.csrf },
    body,
  });
  assert.equal(r.status, 400);
});
