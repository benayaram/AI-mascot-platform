import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import multer from "multer";
import sharp from "sharp";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { store, dataDir } from "./storage.js";
import { reserve, reserveInventory } from "./db.js";
import {
  speech,
  run,
  r2,
  videoDownload,
  claimRenderer,
  releaseRenderer,
} from "./media.js";
import { reply, providerFetch } from "./providers.js";
import { settings } from "./customer-providers.js";
import { requireCompute } from "./runtime.js";
const folder = join(dataDir, "institute");
mkdirSync(folder, { recursive: true });
let bundled;
const browserExecutable =
  process.env.REMOTION_CHROME_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const chromiumOptions = { disableWebSecurity: false, gl: "swangle" };
const inline = (path, mime) =>
  "data:" + mime + ";base64," + readFileSync(path).toString("base64");
export function installInstituteRoutes({
  app,
  auth,
  parse,
  z,
  fail,
  avatarFor,
}) {
  const scene = z.object({
    title: z.string().trim().min(1).max(90),
    narration: z.string().trim().min(5).max(1200),
    points: z.array(z.string().min(1).max(180)).min(1).max(4),
    visual: z.enum(["steps", "cycle"]).default("steps"),
    media_id: z.string().uuid().nullable().optional(),
  });
  const schema = z.object({
    title: z.string().trim().min(1).max(100),
    avatar_id: z.string().min(1),
    scenes: z.array(scene).min(1).max(6),
    animate_avatar: z.boolean().default(true),
    quality: z.enum(["fast", "neural"]).default("fast"),
  });
  const lessonFor = async (req) => {
    const row = await store.one("lessons", {
      id: req.params.id,
      user_id: req.user.id,
    });
    if (!row) fail(404, "Lesson not found");
    return row;
  };
  async function validate(user, v) {
    const avatar = await avatarFor(user, v.avatar_id);
    for (const s of v.scenes)
      if (
        s.media_id &&
        !(await store.one("lesson_assets", {
          id: s.media_id,
          user_id: user.id,
        }))
      )
        fail(400, "Supporting media not found");
    if (v.scenes.reduce((n, s) => n + s.narration.length, 0) > 4000)
      fail(400, "Keep the combined narration below 4,000 characters");
    return avatar;
  }
  const paths = ["/api/lessons", "/api/v1/lessons"];
  app.get(paths, auth, async (req, res) =>
    res.json({
      lessons: await store.find(
        "lessons",
        { user_id: req.user.id },
        { sort: { created_at: -1 }, limit: 30 },
      ),
    }),
  );
  app.post(paths, auth, async (req, res) => {
    const v = parse(schema, req.body);
    await validate(req.user, v);
    if ((await store.find("lessons", { user_id: req.user.id })).length >= 30)
      fail(409, "Remove an old lesson first (30 lesson limit)");
    const row = {
      id: randomUUID(),
      user_id: req.user.id,
      ...v,
      status: "draft",
      created_at: new Date().toISOString(),
    };
    const release = await reserveInventory(
      req.user,
      "lessons",
      30,
      (await store.find("lessons", { user_id: req.user.id })).length,
    );
    try {
      await store.insert("lessons", row);
    } catch (e) {
      await release();
      throw e;
    }
    res.status(201).json({ lesson: row });
  });
  app.post(
    ["/api/lessons/generate", "/api/v1/lessons/generate"],
    auth,
    async (req, res) => {
      const { topic, avatar_id } = parse(
        z.object({
          topic: z.string().trim().min(3).max(500),
          avatar_id: z.string(),
        }),
        req.body,
      );
      const avatar = await avatarFor(req.user, avatar_id);
      const refund = await reserve(req.user, "messages");
      try {
        const answer = await reply(
          {
            ...avatar,
            prompt:
              'You are a teacher. Return ONLY valid JSON: {"title":"short title","scenes":[{"title":"heading","narration":"Two spoken sentences","points":["short point","short point"],"visual":"steps"}]}. Create 3 concise accurate scenes. No Markdown.',
          },
          [{ role: "user", content: topic }],
          { userId: req.user.id, maxTokens: 900, json: true },
        );
        const raw = answer.content
          .replace(/^```(?:json)?\s*|\s*```$/g, "")
          .trim();
        let draft;
        try {
          const generated = JSON.parse(raw);
          if (/^(short title|lesson title|title)$/i.test(generated.title || ""))
            generated.title = topic.slice(0, 100);
          generated.scenes = generated.scenes?.map((s, i) => ({
            ...s,
            title: /^(heading|scene title)$/i.test(s.title || "")
              ? s.narration?.includes(":")
                ? s.narration.split(":")[0].slice(0, 90)
                : "Scene " + (i + 1)
              : s.title,
          }));
          const scenes = generated.scenes?.map((s) => ({
            ...s,
            points:
              Array.isArray(s.points) && s.points.length
                ? s.points
                    .map(String)
                    .map((p) => p.slice(0, 180))
                    .slice(0, 4)
                : [String(s.narration || s.title || "").slice(0, 180)],
          }));
          draft = parse(schema, {
            ...generated,
            scenes,
            avatar_id,
            animate_avatar: true,
            quality: "fast",
          });
        } catch {
          fail(
            422,
            "The model did not return a valid lesson. Edit scenes manually or retry with a smaller topic.",
          );
        }
        await validate(req.user, draft);
        res.json({ draft, sources: answer.sources || [] });
      } catch (e) {
        await refund();
        throw e;
      }
    },
  );
  app.post(
    ["/api/lessons/:id/ask", "/api/v1/lessons/:id/ask"],
    auth,
    async (req, res) => {
      const row = await lessonFor(req);
      const { question } = parse(
        z.object({ question: z.string().trim().min(2).max(2000) }),
        req.body,
      );
      const avatar = await avatarFor(req.user, row.avatar_id);
      const refund = await reserve(req.user, "messages");
      try {
        const result = await reply(
          {
            ...avatar,
            prompt:
              "You are a patient tutor. Explain using the provided lesson. Ask a clarifying question when necessary. If the lesson cannot answer, say so.",
            knowledge_text: row.scenes
              .map((s) => s.title + ": " + s.narration)
              .join("\n"),
          },
          [{ role: "user", content: question }],
          { userId: req.user.id },
        );
        res.json({ ...result, lesson_id: row.id });
      } catch (e) {
        await refund();
        throw e;
      }
    },
  );
  app.get(["/api/lessons/:id", "/api/v1/lessons/:id"], auth, async (req, res) =>
    res.json({ lesson: await lessonFor(req) }),
  );
  app.put(
    ["/api/lessons/:id", "/api/v1/lessons/:id"],
    auth,
    async (req, res) => {
      const row = await lessonFor(req);
      if (row.status === "processing")
        fail(409, "Wait for this export to finish");
      const v = parse(schema, req.body);
      await validate(req.user, v);
      await store.update(
        "lessons",
        { id: row.id },
        { ...v, status: "draft", error: null },
      );
      res.json({ lesson: { ...row, ...v, status: "draft", error: null } });
    },
  );
  app.delete(
    ["/api/lessons/:id", "/api/v1/lessons/:id"],
    auth,
    async (req, res) => {
      const row = await lessonFor(req);
      if (row.status === "processing")
        fail(409, "Wait for this export to finish");
      for (const name of [".mp4", "-captions.vtt"])
        rmSync(join(folder, row.id + name), { force: true });
      if (row.storage_key && r2)
        await r2.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: row.storage_key,
          }),
        );
      if (
        await store.consumeOne("lessons", {
          id: row.id,
          user_id: req.user.id,
          status: row.status,
        })
      )
        await store.refund(req.user.id, "inventory", "lessons", 1);
      res.json({ ok: true });
    },
  );
  const uploads = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  });
  app.get(
    ["/api/lesson-assets", "/api/v1/lesson-assets"],
    auth,
    async (req, res) =>
      res.json({
        assets: await store.find("lesson_assets", { user_id: req.user.id }),
      }),
  );
  app.post(
    ["/api/lesson-assets", "/api/v1/lesson-assets"],
    auth,
    uploads.single("file"),
    async (req, res) => {
      if (!req.file) fail(400, "Select an image or a short MP4/WebM video");
      if (
        (await store.find("lesson_assets", { user_id: req.user.id })).length >=
        20
      )
        fail(409, "Remove a supporting media file first (20 file limit)");
      const id = randomUUID(),
        temp = join(folder, id + ".upload");
      const release = await reserveInventory(
        req.user,
        "lesson_assets",
        20,
        (await store.find("lesson_assets", { user_id: req.user.id })).length,
      );
      let kind, mime, ext;
      try {
        writeFileSync(temp, req.file.buffer);
      } catch (e) {
        await release();
        throw e;
      }
      try {
        if (req.file.mimetype.startsWith("image/")) {
          await sharp(req.file.buffer, { limitInputPixels: 16000000 })
            .rotate()
            .resize(1280, 720, { fit: "inside", withoutEnlargement: true })
            .png()
            .toFile(join(folder, id + ".png"));
          kind = "image";
          mime = "image/png";
          ext = ".png";
        } else {
          const probe = JSON.parse(
            await run(
              "ffprobe",
              [
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-format_whitelist",
                "mov,matroska,webm",
                "-show_format",
                "-show_streams",
                "-of",
                "json",
                temp,
              ],
              { timeout: 15000 },
            ),
          );
          const video = probe.streams?.find((s) => s.codec_type === "video");
          const duration = Number(probe.format?.duration);
          if (
            !video ||
            !duration ||
            duration > 60 ||
            video.width * video.height > 3840 * 2160
          )
            fail(400, "Supporting video must be at most 60 seconds and 4K");
          await run("ffmpeg", [
            "-y",
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-format_whitelist",
            "mov,matroska,webm",
            "-i",
            temp,
            "-vf",
            "scale=1280:720:force_original_aspect_ratio=decrease",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-threads",
            "2",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            join(folder, id + ".mp4"),
          ]);
          kind = "video";
          mime = "video/mp4";
          ext = ".mp4";
        }
        const row = {
          id,
          user_id: req.user.id,
          name: req.file.originalname.slice(0, 100),
          kind,
          mime,
          ext,
        };
        await store.insert("lesson_assets", row);
        res.status(201).json({ asset: row });
      } catch (e) {
        await release();
        for (const ext of [".png", ".mp4"])
          rmSync(join(folder, id + ext), { force: true });
        throw e.status
          ? e
          : Object.assign(
              Error(
                "This media file could not be decoded. Upload a PNG, JPEG, WebP, MP4 or WebM.",
              ),
              { status: 400 },
            );
      } finally {
        rmSync(temp, { force: true });
      }
    },
  );
  app.get(
    ["/api/lesson-assets/:id", "/api/v1/lesson-assets/:id"],
    auth,
    async (req, res) => {
      const row = await store.one("lesson_assets", {
        id: req.params.id,
        user_id: req.user.id,
      });
      if (!row) fail(404, "Media not found");
      res.type(row.mime).sendFile(join(folder, row.id + row.ext));
    },
  );
  app.delete(
    ["/api/lesson-assets/:id", "/api/v1/lesson-assets/:id"],
    auth,
    async (req, res) => {
      const row = await store.one("lesson_assets", {
        id: req.params.id,
        user_id: req.user.id,
      });
      if (!row) fail(404, "Media not found");
      const lessons = await store.find("lessons", { user_id: req.user.id });
      if (lessons.some((l) => l.scenes.some((s) => s.media_id === row.id)))
        fail(409, "Remove this file from lesson scenes first");
      rmSync(join(folder, row.id + row.ext), { force: true });
      const removed = await store.consumeOne("lesson_assets", {
        id: row.id,
        user_id: req.user.id,
      });
      if (removed)
        await store.refund(req.user.id, "inventory", "lesson_assets", 1);
      res.json({ ok: true });
    },
  );
  app.post(
    ["/api/lessons/:id/render", "/api/v1/lessons/:id/render"],
    auth,
    async (req, res) => {
      const row = await lessonFor(req);
      if (row.status === "processing")
        fail(409, "This lesson is already exporting");
      const avatar = await validate(req.user, row);
      const prefs = await settings(req.user.id);
      if (row.animate_avatar && avatar.kind === "realistic")
        await requireCompute(prefs.compute, row.quality);
      if (!claimRenderer())
        fail(429, "Another video is rendering. Try again shortly.");
      let refundVideo, refundVoice;
      try {
        refundVideo = await reserve(req.user, "videos");
        const voiceUnits = row.scenes.reduce(
          (n, s) => n + Math.ceil(s.narration.length / 900),
          0,
        );
        refundVoice = await reserve(req.user, "voice", voiceUnits);
        await store.update(
          "lessons",
          { id: row.id },
          {
            status: "processing",
            progress: 0,
            error: null,
            refund_period: new Date().toISOString().slice(0, 7),
            voice_reserved: voiceUnits,
          },
        );
        renderLesson(row, req.user, avatar, prefs, async () => {
          await refundVideo();
          await refundVoice();
        }).finally(releaseRenderer);
        res.status(202).json({ id: row.id, status: "processing" });
      } catch (e) {
        releaseRenderer();
        await refundVideo?.();
        await refundVoice?.();
        throw e;
      }
    },
  );
  app.get(
    ["/api/lessons/:id/download", "/api/v1/lessons/:id/download"],
    auth,
    async (req, res) => {
      const row = await lessonFor(req);
      if (row.status !== "completed") fail(409, "Export this lesson first");
      if (row.storage_key) await videoDownload(req, res, row);
      else
        res.download(join(folder, row.id + ".mp4"), "BENAI-" + row.id + ".mp4");
    },
  );
  app.get(
    ["/api/lessons/:id/captions", "/api/v1/lessons/:id/captions"],
    auth,
    async (req, res) => {
      const row = await lessonFor(req);
      if (row.status !== "completed") fail(409, "Export this lesson first");
      res.type("text/vtt").sendFile(join(folder, row.id + "-captions.vtt"));
    },
  );
}
async function renderLesson(row, user, avatar, prefs, refund) {
  const temp = join(folder, row.id + "-work");
  mkdirSync(temp, { recursive: true });
  const started = performance.now();
  try {
    const imageFile = avatar.image.startsWith("/uploads/")
      ? join(dataDir, avatar.image.slice(1))
      : resolve("public" + avatar.image);
    const avatarImage = inline(
      imageFile,
      avatar.image.endsWith(".svg") ? "image/svg+xml" : "image/png",
    );
    let total = 0;
    const scenes = [],
      cues = [];
    for (const [i, scene] of row.scenes.entries()) {
      const audio = await speech(scene.narration, avatar.voice, {
        userId: user.id,
      });
      const wav = join(temp, i + ".wav");
      writeFileSync(wav, audio);
      const duration = Number(
        await run("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          wav,
        ]),
      );
      if (
        !Number.isFinite(duration) ||
        duration < 0.2 ||
        duration > 60 ||
        total + duration > 180
      )
        throw Error(
          "Keep each scene below 60 seconds and the lesson below 3 minutes",
        );
      let avatarVideo;
      if (row.animate_avatar && avatar.kind === "realistic") {
        const url = await requireCompute(prefs.compute, row.quality);
        const result = await (
          await providerFetch(
            url + (row.quality === "neural" ? "/render" : "/render-fast"),
            {
              method: "POST",
              timeout: 600000,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                image: readFileSync(imageFile).toString("base64"),
                audio: audio.toString("base64"),
                compute: prefs.compute,
              }),
            },
          )
        ).json();
        avatarVideo = "data:video/mp4;base64," + result.video;
      }
      let media;
      if (scene.media_id) {
        const asset = await store.one("lesson_assets", {
          id: scene.media_id,
          user_id: user.id,
        });
        if (!asset) throw Error("Supporting media was removed");
        media = {
          kind: asset.kind,
          src: inline(join(folder, asset.id + asset.ext), asset.mime),
        };
      }
      scenes.push({
        ...scene,
        duration: Math.ceil(duration * 24) / 24,
        audio: "data:audio/wav;base64," + audio.toString("base64"),
        avatarVideo,
        media,
      });
      cues.push({ start: total, end: total + duration, text: scene.narration });
      total += Math.ceil(duration * 24) / 24;
      await store.update(
        "lessons",
        { id: row.id },
        { progress: Math.round(((i + 1) / row.scenes.length) * 45) },
      );
    }
    bundled ||= bundle({
      entryPoint: resolve("lecture/index.jsx"),
      publicDir: null,
    });
    const serveUrl = await bundled;
    const inputProps = { title: row.title, scenes, avatarImage };
    const composition = await selectComposition({
      serveUrl,
      id: "InstituteLesson",
      inputProps,
      browserExecutable,
      chromiumOptions,
    });
    const output = join(folder, row.id + ".mp4");
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: "h264",
      outputLocation: output,
      browserExecutable,
      chromiumOptions,
      concurrency: 1,
      timeoutInMilliseconds: 120000,
      onProgress: ({ progress }) => {
        store
          .update(
            "lessons",
            { id: row.id },
            { progress: 45 + Math.round(progress * 54) },
          )
          .catch(() => {});
      },
    });
    const time = (n) =>
      new Date(Math.round(n * 1000)).toISOString().slice(11, 23);
    writeFileSync(
      join(folder, row.id + "-captions.vtt"),
      "WEBVTT\n\n" +
        cues
          .map(
            (c, i) =>
              `${i + 1}\n${time(c.start)} --> ${time(c.end)}\n${c.text.replace(/-->/g, "→")}\n`,
          )
          .join("\n"),
    );
    let storage_key = null;
    if (r2) {
      storage_key = `lessons/${user.id}/${row.id}.mp4`;
      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: storage_key,
          Body: readFileSync(output),
          ContentType: "video/mp4",
        }),
      );
    }
    await store.update(
      "lessons",
      { id: row.id },
      {
        status: "completed",
        progress: 100,
        duration: total,
        storage_key,
        render_ms: Math.round(performance.now() - started),
        voice_reserved: 0,
        url: "/api/lessons/" + row.id + "/download",
        caption_url: "/api/lessons/" + row.id + "/captions",
        scene_durations: scenes.map((s) => s.duration),
      },
    );
  } catch (e) {
    await refund();
    await store.update(
      "lessons",
      { id: row.id },
      { status: "failed", error: e.message.slice(0, 300), voice_reserved: 0 },
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
// Single-instance worker: interrupted jobs fail visibly and reserved quotas are refunded once.
for (const row of await store.find("lessons", { status: "processing" })) {
  if (row.refund_period) {
    await store.refund(row.user_id, row.refund_period, "videos", 1);
    await store.refund(
      row.user_id,
      row.refund_period,
      "voice",
      row.voice_reserved || 0,
    );
  }
  await store.update(
    "lessons",
    { id: row.id },
    {
      status: "failed",
      error: "Export interrupted by a server restart. Retry this lesson.",
      voice_reserved: 0,
      refund_period: null,
    },
  );
}
