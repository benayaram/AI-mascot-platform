import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
async function start(extra) {
  const dir = mkdtempSync(join(tmpdir(), "benai-launch-")),
    base = "http://127.0.0.1:3146";
  const child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: "3146",
      APP_URL: base,
      DATA_DIR: dir,
      SMTP_HOST: "",
      MAIL_CAPTURE_DIR: join(dir, "mail"),
      MONGODB_URI: "",
      DEMO_MODE: "true",
      LOCAL_AI_URL: "",
      LOCAL_SPEECH_URL: "",
      LOCAL_IMAGE_URL: "",
      ADMIN_EMAIL: "",
      ADMIN_PASSWORD: "",
      STRIPE_SECRET_KEY: "",
      ...extra,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let errors = "";
  child.stderr.on("data", (b) => (errors += b));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) return { dir, base, child };
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(errors);
}
async function stop(c) {
  if (c.child.exitCode === null) {
    c.child.kill("SIGTERM");
    await new Promise((r) => c.child.once("close", r));
  }
  rmSync(c.dir, { recursive: true, force: true });
}
test("verification gate blocks compute until a one-use email link is consumed", async () => {
  const c = await start({ REQUIRE_VERIFIED_EMAIL: "true" });
  try {
    const r = await fetch(c.base + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Strict user",
        email: "strict@launch.benai",
        password: randomBytes(16).toString("hex"),
      }),
    });
    const cookie = r.headers.get("set-cookie").split(";")[0],
      data = await r.json(),
      headers = {
        "Content-Type": "application/json",
        Cookie: cookie,
        "X-CSRF-Token": data.csrf,
      };
    let t = await fetch(c.base + "/api/tts", {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "Hello" }),
    });
    assert.equal(t.status, 403);
    const mail = JSON.parse(
        readFileSync(join(c.dir, "mail", readdirSync(join(c.dir, "mail"))[0])),
      ),
      token = mail.text.match(/token=([a-f0-9]{64})/)[1];
    t = await fetch(c.base + "/api/auth/verify-email", {
      method: "POST",
      headers,
      body: JSON.stringify({ token }),
    });
    assert.equal(t.status, 200);
    t = await fetch(c.base + "/api/tts", {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "Hello" }),
    });
    assert.equal(t.status, 503); // Gate passed; the deliberately disabled local provider is unavailable.
  } finally {
    await stop(c);
  }
});
test("account mail travels through the real SMTP adapter and avoids token responses", async () => {
  const delivered = [],
    sockets = new Set();
  let current = "";
  const smtp = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.write("220 localhost BENAI test SMTP\r\n");
    let buffer = "",
      dataMode = false;
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let at;
      while ((at = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        if (dataMode) {
          if (line === ".") {
            delivered.push(current);
            current = "";
            dataMode = false;
            socket.write("250 Accepted\r\n");
          } else current += line + "\n";
          continue;
        }
        if (/^EHLO|^HELO/.test(line))
          socket.write("250-localhost\r\n250 PIPELINING\r\n");
        else if (line === "DATA") {
          dataMode = true;
          socket.write("354 End with dot\r\n");
        } else if (line === "QUIT") {
          socket.end("221 Bye\r\n");
        } else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise((r) => smtp.listen(0, "127.0.0.1", r));
  let c;
  try {
    c = await start({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(smtp.address().port),
      SMTP_SECURE: "false",
      SMTP_USER: "",
      MAIL_FROM: "BENAI <mail@test.benai>",
      MAIL_CAPTURE_DIR: "",
    });
    const r = await fetch(c.base + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Mail recipient",
        email: "mail@launch.benai",
        password: randomBytes(16).toString("hex"),
      }),
    });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.token, undefined);
    assert.equal(delivered.length, 1);
    assert.match(delivered[0], /Verify your BENAI email/);
    assert.match(
      delivered[0].replace(/=\n/g, "").replace(/=3D/g, "="),
      /token=[a-f0-9]{64}/,
    );
  } finally {
    if (c) await stop(c);
    for (const socket of sockets) socket.destroy();
    await new Promise((r) => smtp.close(r));
  }
});
