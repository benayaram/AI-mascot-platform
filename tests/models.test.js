import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
test(
  "real free diffusion avatar generation through the authenticated backend",
  { skip: process.env.BENAI_TEST_MODELS !== "1", timeout: 120000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "benai-image-test-"));
    const child = spawn(process.execPath, ["server/index.js"], {
      env: {
        ...process.env,
        PORT: "3140",
        APP_URL: "http://127.0.0.1:3140",
        DATA_DIR: dir,
        MONGODB_URI: "",
        DEMO_MODE: "false",
        LOCAL_AI_URL: "http://127.0.0.1:8081/v1",
        LOCAL_SPEECH_URL: "http://127.0.0.1:8082",
        LOCAL_IMAGE_URL: "http://127.0.0.1:8083",
        ADMIN_EMAIL: "",
        ADMIN_PASSWORD: "",
        AI_PROVIDER_KEY: "",
        OPENAI_API_KEY: "",
      },
      stdio: "ignore",
    });
    try {
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch("http://127.0.0.1:3140/api/health")).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      const response = await fetch("http://127.0.0.1:3140/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Image creator",
          email: "image@test.benai",
          password: randomBytes(16).toString("hex"),
        }),
      });
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie").split(";")[0],
        data = await response.json(),
        headers = {
          Cookie: cookie,
          "X-CSRF-Token": data.csrf,
          "Content-Type": "application/json",
        };
      const r = await fetch("http://127.0.0.1:3140/api/avatars/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt:
            "Cute friendly blue robot, round eyes, cheerful smile, 3D clay character illustration, pastel background",
        }),
      });
      assert.equal(r.status, 200);
      const image = await r.json();
      assert.equal(image.procedural, undefined);
      const file = await fetch("http://127.0.0.1:3140" + image.image, {
        headers,
      });
      assert.equal(file.status, 200);
      const bytes = Buffer.from(await file.arrayBuffer());
      assert.ok(
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      );
      assert.equal((await sharp(bytes).metadata()).width, 384);
      const me = await (
        await fetch("http://127.0.0.1:3140/api/auth/me", { headers })
      ).json();
      assert.equal(me.usage.images, 1);
      writeFileSync("/workspace/BENAI-output/ai-avatar.png", bytes);
    } finally {
      child.kill("SIGTERM");
      await new Promise((r) => child.once("close", r));
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
