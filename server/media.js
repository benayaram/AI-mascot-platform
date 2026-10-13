import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { dataDir, store } from "./storage.js";
import { unavailable, providerFetch } from "./providers.js";
export const r2 =
  process.env.R2_ENDPOINT &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET
    ? new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      })
    : null;
export function run(command, args, { timeout = 120000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "",
      err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Media rendering timed out"));
    }, timeout);
    child.stdout.on("data", (b) => {
      out += b;
    });
    child.stderr.on("data", (b) => {
      err = (err + b).slice(-2000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolvePromise(out)
        : reject(new Error("Media tool failed: " + err.slice(-500)));
    });
  });
}
export async function speech(text, voice = "coral", options = {}) {
  if (!process.env.LOCAL_SPEECH_URL) throw unavailable("Local speech");
  return Buffer.from(
    await (
      await providerFetch(process.env.LOCAL_SPEECH_URL + "/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
        ...options,
      })
    ).arrayBuffer(),
  );
}
let rendering = false;
export function rendererBusy() {
  return rendering;
}
export function claimRenderer() {
  if (rendering) return false;
  rendering = true;
  return true;
}
export function releaseRenderer() {
  rendering = false;
}
export async function renderLocalVideo(id, user, avatar, script, refund) {
  rendering = true;
  const folder = join(dataDir, "tmp", id);
  mkdirSync(folder, { recursive: true });
  try {
    const wav = await speech(script, avatar.voice);
    const audio = join(folder, "speech.wav");
    writeFileSync(audio, wav);
    const duration = Number(
      await run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        audio,
      ]),
    );
    if (!Number.isFinite(duration) || duration > 60)
      throw new Error(
        "This script is longer than 60 seconds. Shorten it and try again.",
      );
    const target = join(dataDir, "videos", id + ".mp4");
    if (avatar.kind === "realistic") {
      if (!process.env.LOCAL_PORTRAIT_URL)
        throw unavailable("Neural portrait rendering");
      const sourceFile = avatar.image.startsWith("/uploads/")
        ? join(dataDir, avatar.image.slice(1))
        : resolve("public" + avatar.image);
      const response = await providerFetch(
        process.env.LOCAL_PORTRAIT_URL + "/render",
        {
          method: "POST",
          timeout: 600000,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: readFileSync(sourceFile).toString("base64"),
            audio: wav.toString("base64"),
          }),
        },
      );
      const rendered = await response.json();
      writeFileSync(target, Buffer.from(rendered.video, "base64"));
      let storage_key = null;
      if (r2) {
        storage_key = `videos/${user.id}/${id}.mp4`;
        await r2.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: storage_key,
            Body: readFileSync(target),
            ContentType: "video/mp4",
          }),
        );
      }
      await store.update(
        "videos",
        { id },
        {
          status: "completed",
          url: "/api/videos/" + id + "/download",
          storage_key,
          duration: rendered.duration,
          model: rendered.model,
          render_ms: rendered.render_ms,
          fps: rendered.fps,
          device: rendered.device,
        },
      );
      return;
    }
    const pcm = join(folder, "speech.pcm");
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      audio,
      "-f",
      "f32le",
      "-ac",
      "1",
      "-ar",
      "12000",
      pcm,
    ]);
    const samples = readFileSync(pcm);
    let source = avatar.image.startsWith("/avatars/")
      ? readFileSync(resolve("public" + avatar.image), "utf8")
      : null;
    if (source && avatar.appearance) {
      const a = avatar.appearance;
      if (a.suitColor)
        source = source.replace(
          /(<path d="M57 320[^"]*" fill=")[^"]*/,
          "$1" + a.suitColor,
        );
      if (a.hairColor)
        source = source.replace(
          /(<path d="M86 157[^"]*" fill=")[^"]*/,
          "$1" + a.hairColor,
        );
      if (a.glasses)
        source = source.replace(
          "</svg>",
          '<g stroke="#403549" stroke-width="4" fill="none"><rect x="108" y="146" width="41" height="28" rx="9"/><rect x="174" y="146" width="41" height="28" rx="9"/><path d="M149 155h25"/></g></svg>',
        );
    }
    const custom = avatar.image.startsWith("/uploads/")
      ? join(dataDir, avatar.image.slice(1))
      : resolve("public" + avatar.image);
    const count = Math.ceil(duration * 12);
    for (let frame = 0; frame < count; frame++) {
      let sum = 0,
        n = 0;
      const first = Math.floor(frame * 1000),
        last = Math.min(first + 1000, samples.length / 4);
      for (let i = first; i < last; i++) {
        sum += samples.readFloatLE(i * 4) ** 2;
        n++;
      }
      const amplitude = Math.sqrt(sum / Math.max(n, 1));
      const svg = source?.replace(
        "translate(160 197) scale(1 1)",
        `translate(160 197) scale(1 ${Math.max(0.2, Math.min(3, amplitude * 22))})`,
      );
      await sharp(svg ? Buffer.from(svg) : custom)
        .resize(640, 640, { fit: "cover" })
        .png()
        .toFile(join(folder, `frame-${String(frame).padStart(5, "0")}.png`));
    }
    const filename = id + ".mp4";
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-threads",
      "2",
      "-framerate",
      "12",
      "-i",
      join(folder, "frame-%05d.png"),
      "-i",
      audio,
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      target,
    ]);
    let storage_key = null;
    if (r2) {
      storage_key = `videos/${user.id}/${filename}`;
      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: storage_key,
          Body: readFileSync(target),
          ContentType: "video/mp4",
        }),
      );
    }
    await store.update(
      "videos",
      { id },
      {
        status: "completed",
        url: "/api/videos/" + id + "/download",
        storage_key,
        duration,
      },
    );
  } catch (e) {
    await store.update(
      "videos",
      { id },
      {
        status: "failed",
        error: /^(This script|This (cpu|cuda) neural|Use a clear)/.test(
          e.message,
        )
          ? e.message
          : "Local video rendering failed. Check the speech and FFmpeg services.",
      },
    );
    await refund();
    console.error("Video render failure:", e.message);
  } finally {
    rendering = false;
    rmSync(folder, { recursive: true, force: true });
  }
}
export async function videoDownload(req, res, video) {
  if (video.storage_key && r2) {
    res.redirect(
      await getSignedUrl(
        r2,
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: video.storage_key,
        }),
        { expiresIn: 300 },
      ),
    );
  } else {
    const file = join(dataDir, "videos", video.id + ".mp4");
    if (!existsSync(file)) {
      res.status(404).json({ error: "Video file not found" });
      return;
    }
    res.type("video/mp4").sendFile(file);
  }
}
export async function illustration(prompt) {
  const number = parseInt(
    (await import("node:crypto"))
      .createHash("sha256")
      .update(prompt)
      .digest("hex")
      .slice(0, 8),
    16,
  );
  const names = ["nova", "atlas", "luna", "pixel", "sage", "orbit"];
  let source = readFileSync(
    resolve("public/avatars/" + names[number % 6] + ".svg"),
    "utf8",
  );
  const color = "#" + ((number >>> 8) & 0xffffff).toString(16).padStart(6, "0");
  source = source.replace(/#[a-f0-9]{6}/i, color);
  const filename = randomUUID() + ".png";
  await sharp(Buffer.from(source))
    .png()
    .toFile(join(dataDir, "uploads", filename));
  return "/uploads/" + filename;
}
