import { credential, externalRequest } from "./customer-providers.js";
import { store, dataDir } from "./storage.js";
import { r2 } from "./media.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { safeMediaUrl } from "./provider-security.js";
async function download(value) {
  if (
    process.env.NODE_ENV === "test" &&
    process.env.BENAI_PROVIDER_FIXTURE_URL &&
    value.startsWith(process.env.BENAI_PROVIDER_FIXTURE_URL + "/media/")
  )
    return Buffer.from(await (await fetch(value)).arrayBuffer());
  const u = safeMediaUrl(value),
    r = await fetch(u, {
      redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
  if (!r.ok) throw Error("HeyGen media download failed");
  let size = 0;
  const chunks = [];
  for await (const chunk of r.body) {
    size += chunk.length;
    if (size > 100 * 1024 * 1024)
      throw Error("Video exceeds the 100 MB download limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function renderHeyGen(
  id,
  user,
  avatar,
  script,
  refund,
  existingId,
) {
  const started = performance.now();
  try {
    const c = await credential(user.id, "heygen");
    if (!c.voice || !(avatar.provider_avatar_id || c.avatar_id))
      throw Object.assign(
        Error("Select a HeyGen avatar ID and voice ID in AI settings"),
        { status: 400 },
      );
    let externalId = existingId;
    const headers = { "Content-Type": "application/json", "X-Api-Key": c.key };
    if (!externalId) {
      const d = await (
        await externalRequest("heygen", "/v2/video/generate", {
          method: "POST",
          headers,
          body: JSON.stringify({
            video_inputs: [
              {
                character: {
                  type: "avatar",
                  avatar_id: avatar.provider_avatar_id || c.avatar_id,
                  avatar_style: "normal",
                },
                voice: { type: "text", input_text: script, voice_id: c.voice },
                background: { type: "color", value: "#f4f0fc" },
              },
            ],
            dimension: { width: 640, height: 640 },
          }),
        })
      ).json();
      externalId = d.data?.video_id;
      if (!externalId) throw Error("HeyGen did not return a video job");
      await store.update(
        "videos",
        { id },
        {
          external_id: externalId,
          model: "HeyGen",
          compute: "provider",
          quality: "external",
        },
      );
    }
    for (let attempt = 0; attempt < 120; attempt++) {
      const d = await (
          await externalRequest(
            "heygen",
            "/v1/video_status.get?video_id=" + encodeURIComponent(externalId),
            { headers },
          )
        ).json(),
        job = d.data;
      if (job?.status === "failed")
        throw Error(
          "HeyGen could not render the video. Check your provider dashboard.",
        );
      if (job?.status === "completed" && job.video_url) {
        const bytes = await download(job.video_url);
        if (bytes.length < 12 || bytes.subarray(4, 8).toString() !== "ftyp")
          throw Error("HeyGen returned invalid MP4 media");
        const target = join(dataDir, "videos", id + ".mp4");
        writeFileSync(target, bytes);
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
            duration: job.duration || null,
            render_ms: Math.round(performance.now() - started),
            device: "provider",
          },
        );
        return;
      }
      await delay(process.env.NODE_ENV === "test" ? 20 : 5000);
    }
    throw Error(
      "HeyGen is taking longer than ten minutes. Check its dashboard before retrying; provider charges may still apply.",
    );
  } catch (e) {
    await store.update(
      "videos",
      { id },
      { status: "failed", error: e.message },
    );
    await refund();
  }
}
