import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
test("R2-compatible video upload and expiring signed private download", async () => {
  const dir = mkdtempSync(join(tmpdir(), "benai-r2-"));
  const objects = new Map();
  let signatureSeen = false;
  const samples = 22050,
    wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(22050, 24);
  wav.writeUInt32LE(44100, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * 220) / 22050) * 6000),
      44 + i * 2,
    );
  const fixture = createServer((req, res) => {
    if (req.url === "/tts") {
      res.writeHead(200, { "Content-Type": "audio/wav" });
      res.end(wav);
      return;
    }
    if (req.method === "PUT") {
      signatureSeen =
        !!req.headers.authorization?.startsWith("AWS4-HMAC-SHA256");
      const chunks = [];
      req.on("data", (b) => chunks.push(b));
      req.on("end", () => {
        objects.set(req.url, Buffer.concat(chunks));
        res.writeHead(200, {
          ETag: '"fixture"',
          "Content-Type": "application/xml",
        });
        res.end("");
      });
    } else {
      res.writeHead(200, { "Content-Type": "video/mp4" });
      res.end([...objects.values()][0]);
    }
  });
  await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
  const endpoint = "http://127.0.0.1:" + fixture.address().port;
  Object.assign(process.env, {
    DATA_DIR: dir,
    LOCAL_SPEECH_URL: endpoint,
    R2_ENDPOINT: endpoint,
    R2_BUCKET: "private-videos",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key",
  });
  const { renderLocalVideo, videoDownload } =
    await import("../../server/media.js");
  const { store } = await import("../../server/storage.js");
  try {
    const id = randomUUID();
    await store.insert("videos", {
      id,
      user_id: "fixture-user",
      avatar_id: "nova",
      script: "Fixture audio",
      provider_id: "local",
      status: "processing",
    });
    let refunded = false;
    await renderLocalVideo(
      id,
      { id: "fixture-user" },
      { id: "nova", name: "Nova", image: "/avatars/nova.svg", voice: "coral" },
      "Fixture audio",
      async () => {
        refunded = true;
      },
    );
    const video = await store.one("videos", { id });
    assert.equal(video.status, "completed");
    assert.equal(refunded, false);
    assert.equal(signatureSeen, true);
    assert.equal(objects.size, 1);
    assert.ok(
      [...objects.values()][0].subarray(4, 8).equals(Buffer.from("ftyp")),
    );
    assert.ok(video.storage_key.startsWith("videos/fixture-user/"));
    let signed;
    await videoDownload(
      {},
      {
        redirect: (url) => {
          signed = url;
        },
      },
      video,
    );
    const url = new URL(signed);
    assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
    assert.ok(url.searchParams.get("X-Amz-Signature"));
    assert.ok(url.pathname.endsWith(id + ".mp4"));
  } finally {
    await store.close();
    await new Promise((r) => fixture.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
