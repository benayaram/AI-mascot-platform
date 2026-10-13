import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
const enabled = process.env.BENAI_TEST_NEURAL === "1";
test(
  "self-hosted realistic video is rendered, persisted, playable and private",
  { skip: !enabled, timeout: 240000 },
  async () => {
    const folder = mkdtempSync(join(tmpdir(), "benai-neural-api-")),
      base = "http://127.0.0.1:3144";
    const child = spawn(process.execPath, ["server/index.js"], {
      env: {
        ...process.env,
        PORT: "3144",
        APP_URL: base,
        DATA_DIR: folder,
        DEMO_MODE: "false",
        LOCAL_AI_URL: "http://127.0.0.1:8081/v1",
        LOCAL_SPEECH_URL: "http://127.0.0.1:8082",
        LOCAL_PORTRAIT_URL: "http://127.0.0.1:8084",
        LOCAL_IMAGE_URL: "",
        MONGODB_URI: "",
        ADMIN_EMAIL: "",
        ADMIN_PASSWORD: "",
        STRIPE_SECRET_KEY: "",
      },
      stdio: "ignore",
    });
    try {
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(base + "/api/health")).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      const register = await fetch(base + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Neural creator",
          email: "neural@qc.benai",
          password: randomBytes(16).toString("hex"),
        }),
      });
      assert.equal(register.status, 200);
      const cookie = register.headers.get("set-cookie").split(";")[0],
        data = await register.json(),
        headers = {
          Cookie: cookie,
          "X-CSRF-Token": data.csrf,
          "Content-Type": "application/json",
        };
      const before = performance.now();
      const create = await fetch(base + "/api/videos", {
        method: "POST",
        headers,
        body: JSON.stringify({
          avatar_id: "amara",
          script: "Hello, I am BENAI.",
          quality: "neural",
          compute: "cpu",
        }),
      });
      assert.equal(create.status, 202);
      const { id } = await create.json();
      let video;
      for (let i = 0; i < 210; i++) {
        video = (
          await (await fetch(base + "/api/videos/" + id, { headers })).json()
        ).video;
        if (video.status !== "processing") break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      assert.equal(video.status, "completed", video.error);
      assert.equal(video.model, "MuseTalk-1.5");
      assert.equal(video.device, "cpu");
      assert.equal(video.fps, 12);
      assert.ok(video.render_ms > 0);
      assert.ok(video.duration > 1);
      const file = await fetch(base + video.url, { headers });
      assert.equal(file.status, 200);
      assert.equal(file.headers.get("content-type"), "video/mp4");
      const bytes = Buffer.from(await file.arrayBuffer());
      assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
      assert.equal((await fetch(base + video.url)).status, 401);
      assert.equal(
        (await (await fetch(base + "/api/auth/me", { headers })).json()).usage
          .videos,
        1,
      );
      writeFileSync("/workspace/BENAI-output/v3-neural-portrait.mp4", bytes);
      writeFileSync(
        "/tmp/benai-v3-neural-metrics.json",
        JSON.stringify(
          {
            ...video,
            script: undefined,
            user_id: undefined,
            id: undefined,
            url: undefined,
            total_ms: Math.round(performance.now() - before),
          },
          null,
          2,
        ),
      );
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await new Promise((r) => child.once("close", r));
      }
      rmSync(folder, { recursive: true, force: true });
    }
  },
);
