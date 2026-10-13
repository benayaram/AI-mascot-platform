import {
  providerCatalog,
  credentialSummaries,
  saveCredential,
  saveDocument,
  settings,
  discoverProvider,
  customerSpeech,
} from "./customer-providers.js";
import { computeCapabilities, workerHealth } from "./runtime.js";
import { store } from "./storage.js";
import { reserve } from "./db.js";
export function installProviderRoutes({
  app,
  auth,
  admin,
  parse,
  z,
  audit,
  fail,
}) {
  const names = Object.keys(providerCatalog);
  const privateSession = (req, res, next) =>
    req.apiKey
      ? res.status(403).json({
          error: "Use your signed-in account to manage provider credentials",
        })
      : next();
  app.get("/api/provider-settings", auth, privateSession, async (req, res) =>
    res.json({
      settings: await settings(req.user.id),
      credentials: await credentialSummaries(req.user.id),
      catalog: providerCatalog,
      compute: await computeCapabilities(),
      storage: store.engine,
    }),
  );
  app.put(
    "/api/provider-credentials/:provider",
    auth,
    privateSession,
    async (req, res) => {
      const name = req.params.provider;
      if (!names.includes(name)) fail(400, "Unknown provider");
      const v = parse(
        z.object({
          key: z.string().trim().min(8).max(2048).optional(),
          model: z
            .string()
            .regex(/^[a-zA-Z0-9._-]+$/)
            .max(150)
            .optional(),
          voice: z
            .string()
            .regex(/^[a-zA-Z0-9._ -]*$/)
            .max(150)
            .optional(),
          avatar_id: z
            .string()
            .regex(/^[a-zA-Z0-9_-]*$/)
            .max(150)
            .optional(),
        }),
        req.body,
      );
      if (
        v.model &&
        providerCatalog[name].kind === "tts" &&
        !providerCatalog[name].models.includes(v.model)
      )
        fail(400, "Choose a supported TTS model");
      await saveCredential(req.user.id, name, v);
      await audit(req.user.id, "provider.saved", { provider: name });
      res.json({ ok: true });
    },
  );
  app.delete(
    "/api/provider-credentials/:provider",
    auth,
    privateSession,
    async (req, res) => {
      await store.remove("provider_credentials", {
        id: req.user.id + ":" + req.params.provider,
      });
      const p = await settings(req.user.id);
      await saveDocument("customer_settings", req.user.id, {
        user_id: req.user.id,
        ...(p.tts === req.params.provider ? { tts: "local" } : {}),
        ...(p.video === req.params.provider ? { video: "local" } : {}),
      });
      await audit(req.user.id, "provider.deleted", {
        provider: req.params.provider,
      });
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/provider-credentials/:provider/test",
    auth,
    privateSession,
    async (req, res) => {
      if (!names.includes(req.params.provider)) fail(400, "Unknown provider");
      res.json(await discoverProvider(req.user.id, req.params.provider));
    },
  );
  app.put("/api/provider-settings", auth, privateSession, async (req, res) => {
    const v = parse(
      z.object({
        tts: z.enum(["local", "gemini", "openai", "elevenlabs"]),
        video: z.enum(["local", "heygen"]),
        compute: z.enum(["cpu", "gpu"]),
        quality: z.enum(["fast", "neural"]),
      }),
      req.body,
    );
    const existing = await credentialSummaries(req.user.id);
    for (const p of [v.tts, v.video])
      if (p !== "local" && !existing.some((c) => c.provider === p))
        fail(400, "Save your " + p + " key first");
    if (v.compute === "gpu" && !(await computeCapabilities()).gpu.available)
      fail(
        503,
        "GPU is unavailable. Configure a compatible CUDA worker before switching.",
      );
    if (v.compute === "gpu" && v.quality === "fast")
      fail(400, "Choose neural quality for GPU mode");
    await saveDocument("customer_settings", req.user.id, {
      user_id: req.user.id,
      ...v,
    });
    res.json({ settings: v });
  });
  app.post("/api/provider-preview", auth, privateSession, async (req, res) => {
    const { text } = parse(
      z.object({ text: z.string().trim().min(1).max(150) }),
      req.body,
    );
    if ((await settings(req.user.id)).tts === "local")
      fail(400, "Select an external TTS provider first");
    const refund = await reserve(req.user, "voice");
    try {
      const audio = await customerSpeech(req.user.id, text);
      res.type("audio/wav").send(audio);
    } catch (e) {
      await refund();
      throw e;
    }
  });
  app.get("/api/runtime", auth, async (req, res) =>
    res.json(await computeCapabilities()),
  );
  app.get("/api/ready", async (req, res) => {
    const [chat, speech] = await Promise.all([
      workerHealth(process.env.LOCAL_AI_URL?.replace(/\/v1$/, "")),
      workerHealth(process.env.LOCAL_SPEECH_URL),
    ]);
    const ready = chat.status === "ready" && speech.status === "ready";
    res
      .status(ready ? 200 : 503)
      .json({ status: ready ? "ready" : "degraded" });
  });
  app.get("/api/admin/operations", auth, admin, async (req, res) => {
    const names = [
      ["chat", process.env.LOCAL_AI_URL?.replace(/\/v1$/, "")],
      ["speech", process.env.LOCAL_SPEECH_URL],
      ["images", process.env.LOCAL_IMAGE_URL],
      ["portraits", process.env.LOCAL_PORTRAIT_URL],
    ];
    const services = await Promise.all(
      names.map(async ([name, url]) => ({
        name,
        ...(await workerHealth(url)),
      })),
    );
    const videos = await store.find(
      "videos",
      {},
      { sort: { created_at: -1 }, limit: 100 },
    );
    res.json({
      services,
      compute: await computeCapabilities(),
      storage: store.engine,
      mail_configured: !!process.env.SMTP_HOST,
      master_key_configured: !!process.env.BYOK_MASTER_KEY,
      processing: videos.filter((v) => v.status === "processing").length,
      failed: videos.filter((v) => v.status === "failed").length,
      recent_renders: videos
        .filter((v) => v.status === "completed")
        .slice(0, 10)
        .map(({ id, compute, quality, render_ms, model, duration }) => ({
          id,
          compute,
          quality,
          render_ms,
          model,
          duration,
        })),
      single_instance: true,
    });
  });
}
