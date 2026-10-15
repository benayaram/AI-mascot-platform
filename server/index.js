import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  randomUUID,
  randomBytes,
  createHash,
  timingSafeEqual,
  scryptSync,
} from "node:crypto";
try {
  process.loadEnvFile(".env");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const {
  store,
  dataDir,
  passwordHash,
  plans,
  reserve,
  reserveInventory,
  userUsage,
  audit,
} = await import("./db.js");
const { stripe, demo, providers, reply, unavailable, providerFetch } =
  await import("./providers.js");
const {
  speech,
  renderLocalVideo,
  rendererBusy,
  claimRenderer,
  releaseRenderer,
  videoDownload,
  illustration,
} = await import("./media.js");
const { reconcileSubscription } = await import("./billing.js");
const { attachRealtime } = await import("./realtime.js");
const { repo } = await import("./repository.js");
const { installKnowledgeRoutes } = await import("./knowledge.js");
const { installInstituteRoutes } = await import("./institute.js");
const { installProviderRoutes } = await import("./v3-routes.js");
const { settings } = await import("./customer-providers.js");
const { requireCompute } = await import("./runtime.js");
const { renderHeyGen } = await import("./heygen.js");
const { installAccountRoutes, sendAccountMail, mailAvailable } =
  await import("./accounts.js");
const { installGrowthRoutes, referralCode } = await import("./growth.js");
const { default: express } = await import("express");
const { default: helmet } = await import("helmet");
const { rateLimit } = await import("express-rate-limit");
const { default: multer } = await import("multer");
const { z } = await import("zod");
const app = express();
const port = Number(process.env.PORT || 3001);
const appUrl = process.env.APP_URL || `http://localhost:${port}`;
const production = process.env.NODE_ENV === "production";
if (production && !appUrl.startsWith("https://"))
  throw new Error("Production APP_URL must use HTTPS");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
const hash = (v) => createHash("sha256").update(v).digest("hex");
const safeUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  plan: u.plan,
  created_at: u.created_at,
  email_verified: !!u.email_verified,
});
const fail = (status, msg) => {
  const e = new Error(msg);
  e.status = status;
  throw e;
};
const parse = (schema, body) => {
  const r = schema.safeParse(body);
  if (!r.success)
    fail(
      400,
      r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "),
    );
  return r.data;
};
const email = z
  .string()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase().trim());
const password = z.string().min(12).max(128);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'", "blob:", "https:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  }),
);
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req, res, next) => {
    try {
      if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)
        throw unavailable("Billing webhook");
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          req.headers["stripe-signature"],
          process.env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        fail(400, "Invalid webhook signature");
      }
      const outcome = await reconcileSubscription(event, stripe, store, {
        pro: process.env.STRIPE_PRO_PRICE_ID,
        business: process.env.STRIPE_BUSINESS_PRICE_ID,
      });
      if (outcome) await audit(null, "billing.subscription", outcome);
      res.json({ received: true });
    } catch (e) {
      next(e);
    }
  },
);
app.use(express.json({ limit: "1mb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 600,
    skip: (req) => !["GET", "HEAD", "OPTIONS"].includes(req.method),
    message: { error: "Too many read requests. Wait a minute and try again." },
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 180,
    skip: (req) => ["GET", "HEAD", "OPTIONS"].includes(req.method),
    message: { error: "Too many changes. Wait a minute and try again." },
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use("/api", async (req, res, next) => {
  try {
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    const cookie = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("persona_session="))
      ?.slice(16);
    if (bearer) {
      const key = await repo.apiByHash(hash(bearer));
      if (key) {
        req.user = await repo.user(key.user_id);
        req.apiKey = true;
      }
    } else if (cookie) {
      const s = await repo.session(hash(cookie), Date.now());
      if (s) {
        req.user = await repo.user(s.user_id);
        req.csrf = s.csrf;
      }
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const allowed = [new URL(appUrl).origin];
      if (!production)
        allowed.push("http://localhost:5173", "http://127.0.0.1:5173");
      if (req.headers.origin && !allowed.includes(req.headers.origin))
        fail(403, "Origin not allowed");
      if (
        req.user &&
        !req.apiKey &&
        !req.path.startsWith("/embed/") &&
        !req.path.startsWith("/public-demo/") &&
        req.headers["x-csrf-token"] !== req.csrf
      )
        fail(403, "Invalid CSRF token");
    }
    next();
  } catch (e) {
    next(e);
  }
});
const auth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: "Sign in to continue" });
const admin = (req, res, next) =>
  req.user?.role === "admin"
    ? next()
    : res.status(403).json({ error: "Administrator access required" });
const apiAccess = (req, res, next) =>
  plans[req.user.plan].api
    ? next()
    : res
        .status(402)
        .json({ error: "API and embeds require a Creator or Business plan" });
async function session(req, res, user) {
  const token = randomBytes(32).toString("hex"),
    csrf = randomBytes(24).toString("hex");
  await repo.expireSessions(Date.now());
  await repo.createSession(
    hash(token),
    user.id,
    csrf,
    Date.now() + 7 * 86400000,
  );
  res.cookie("persona_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: production,
    maxAge: 7 * 86400000,
    path: "/",
  });
  res.json({ user: safeUser(user), csrf });
}
const loginLimiter = rateLimit({
  windowMs: 15 * 60000,
  limit: 20,
  message: {
    error:
      "Too many sign-in or recovery attempts. Wait 15 minutes and try again.",
  },
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
app.use("/api", (req, res, next) => {
  if (
    (production || process.env.REQUIRE_VERIFIED_EMAIL === "true") &&
    req.user &&
    req.user.role !== "admin" &&
    !req.user.email_verified &&
    req.method !== "GET" &&
    /^\/(chat|v1|tts|transcribe|images|avatars\/generate|videos|keys|embeds|provider-preview|lessons|knowledge|institute|billing\/checkout)/.test(
      req.path,
    )
  )
    return res.status(403).json({
      error:
        "Verify your email before using paid or compute-intensive features",
    });
  next();
});
installProviderRoutes({ app, auth, admin, parse, z, audit, fail });
installAccountRoutes({
  app,
  auth,
  parse,
  z,
  fail,
  passwordHash,
  password,
  email,
  appUrl,
  loginLimiter,
  audit,
});
installGrowthRoutes({
  app,
  auth,
  parse,
  z,
  fail,
  avatarFor,
  rateLimit,
  email,
  appUrl,
  audit,
});
app.get("/api/health", async (req, res) =>
  res.json({ status: "ok", storage: store.engine, providers: providers() }),
);
app.use("/api/v1", auth, apiAccess);
installKnowledgeRoutes({ app, auth, parse, z, fail });
installInstituteRoutes({ app, auth, parse, z, fail, avatarFor });
app.get("/api/models", auth, async (req, res) => {
  const configured = [
    ["chat", process.env.LOCAL_AI_URL?.replace(/\/v1$/, "")],
    ["speech", process.env.LOCAL_SPEECH_URL],
    ["images", process.env.LOCAL_IMAGE_URL],
    ["portraits", process.env.LOCAL_PORTRAIT_URL],
  ];
  const models = await Promise.all(
    configured.map(async ([name, url]) => {
      if (!url) return { name, status: "not_configured" };
      try {
        const r = await fetch(url + "/health", {
          signal: AbortSignal.timeout(3000),
        });
        if (!r.ok) throw Error();
        const health = await r.json();
        return {
          name,
          status: "ready",
          model: health.model || name,
          device: health.device || "cpu",
          max_seconds: health.max_seconds,
        };
      } catch {
        return { name, status: "offline" };
      }
    }),
  );
  res.json({
    release: "3.0.0-beta.1",
    models,
    voice_transport: "self-hosted-websocket",
    live_visual: "local-face-mesh",
    neural_video: "queued",
  });
});
app.get("/api/plans", async (req, res) => res.json({ plans }));
app.post("/api/auth/register", loginLimiter, async (req, res) => {
  const v = parse(
    z.object({
      name: z.string().trim().min(2).max(80),
      email,
      password,
      referral: z
        .string()
        .regex(/^[a-f0-9]{12}$/)
        .optional(),
    }),
    req.body,
  );
  if (await repo.userByEmail(v.email))
    fail(409, "An account with this email already exists");
  const id = randomUUID();
  await repo.createUser(id, v.email, v.name, passwordHash(v.password));
  const referrer = v.referral
    ? await store.one("users", { referral_code: v.referral })
    : null;
  await store.update(
    "users",
    { id },
    {
      email_verified: false,
      referral_code: referralCode(id),
      ...(referrer ? { referred_by: referrer.id } : {}),
    },
  );
  if (mailAvailable())
    await sendAccountMail(await repo.user(id), "verify", appUrl).catch(() =>
      audit(id, "email.delivery_failed", {}),
    );
  await session(req, res, await repo.user(id));
});
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const v = parse(z.object({ email, password: z.string().max(128) }), req.body);
  const u = await repo.userByEmail(v.email);
  const stored = u?.password || passwordHash("dummy-password");
  const [salt, key] = stored.split(":");
  if (
    !timingSafeEqual(
      scryptSync(v.password, salt, 64),
      Buffer.from(key, "hex"),
    ) ||
    !u
  )
    fail(401, "Incorrect email or password");
  await session(req, res, u);
});
app.get("/api/auth/me", auth, async (req, res) => {
  const p = await settings(req.user.id),
    external =
      p.tts !== "local" &&
      !!(await store.one("provider_credentials", {
        id: req.user.id + ":" + p.tts,
      }));
  res.json({
    user: safeUser(req.user),
    csrf: req.csrf,
    usage: await userUsage(req.user.id),
    providers: {
      ...providers(),
      tts: !!process.env.LOCAL_SPEECH_URL || external,
      ttsProvider: p.tts,
      videoProvider: p.video,
    },
  });
});
app.post("/api/auth/logout", auth, async (req, res) => {
  const cookie = req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("persona_session="))
    ?.slice(16);
  if (cookie) await repo.deleteSession(hash(cookie));
  res.clearCookie("persona_session", { path: "/" }).json({ ok: true });
});
async function avatarFor(user, id) {
  const a = await repo.avatar(id);
  if (!a || !(a.public || a.owner_id === user.id || user.role === "admin"))
    fail(404, "Avatar not found");
  return a;
}
app.get(["/api/avatars", "/api/v1/avatars"], auth, async (req, res) => {
  const rows =
    req.user.role === "admin"
      ? await repo.avatars()
      : await repo.visibleAvatars(req.user.id);
  res.json({ avatars: rows });
});
const appearanceSchema = z.object({
  glasses: z.boolean().default(false),
  gesture: z.boolean().default(true),
  suitColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#9d77e8"),
  hairColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#9d77e8"),
});
const avatarSchema = z.object({
  kind: z.enum(["illustrated", "realistic"]).default("illustrated"),
  rights_confirmed: z.boolean().default(false),
  appearance: appearanceSchema.optional(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().min(3).max(300),
  category: z.enum([
    "Creative",
    "Support",
    "Education",
    "Business",
    "Companion",
  ]),
  prompt: z.string().trim().min(10).max(4000),
  voice: z.enum(["coral", "alloy", "ash", "sage", "verse"]).default("coral"),
  image: z
    .string()
    .regex(
      /^\/(avatars\/[a-z]+\.svg|realistic\/[a-z-]+\.png|uploads\/[a-f0-9-]+\.(png|jpg|webp))$/,
    ),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#e7ddfc"),
  public: z.boolean().default(false),
});
async function assertImageAccess(user, image) {
  if (!image.startsWith("/uploads/")) return;
  const asset = await store.one("assets", { id: image.split("/").pop() });
  const references = await store.find("avatars", { image });
  if (
    user.role === "admin" ||
    asset?.owner_id === user.id ||
    references.some((a) => a.public || a.owner_id === user.id)
  )
    return;
  fail(403, "This portrait belongs to a different account");
}
async function createAvatar(req, res) {
  const v = parse(avatarSchema, req.body);
  if (v.kind === "realistic" && !v.rights_confirmed)
    fail(
      400,
      "Confirm permission to use the portrait before creating a realistic avatar",
    );
  if (v.public && req.user.role !== "admin")
    fail(403, "Only administrators can publish shared avatars");
  const count = (await repo.avatarCount(req.user.id)).n;
  if (count >= plans[req.user.plan].avatars)
    fail(402, "Avatar limit reached for your plan");
  if (
    !existsSync(
      v.image.startsWith("/uploads/")
        ? join(dataDir, v.image.slice(1))
        : join("public", v.image.slice(1)),
    )
  )
    fail(400, "Avatar image does not exist");
  await assertImageAccess(req.user, v.image);
  const undoInventory = await reserveInventory(
    req.user,
    "avatars",
    plans[req.user.plan].avatars,
    count,
  );
  const id = randomUUID();
  try {
    await repo.createAvatar(
      id,
      req.user.id,
      v.name,
      v.description,
      v.category,
      v.image,
      v.color,
      v.prompt,
      v.voice,
      Number(v.public),
      null,
    );
  } catch (e) {
    await undoInventory();
    throw e;
  }
  await store.update(
    "avatars",
    { id },
    { kind: v.kind, rights_confirmed: v.rights_confirmed },
  );
  if (v.appearance)
    await store.update("avatars", { id }, { appearance: v.appearance });
  await audit(req.user.id, "avatar.created", { id, public: v.public });
  res.status(201).json({ avatar: await avatarFor(req.user, id) });
}
app.post("/api/avatars", auth, createAvatar);
app.delete("/api/avatars/:id", auth, async (req, res) => {
  const a = await avatarFor(req.user, req.params.id);
  if (a.owner_id !== req.user.id && req.user.role !== "admin")
    fail(403, "You do not own this avatar");
  if ((await repo.avatarConversation(a.id)) || (await repo.avatarVideo(a.id)))
    fail(409, "This avatar has conversations or videos; it cannot be deleted");
  await repo.deleteAvatarEmbeds(a.id);
  await store.ensureInventory(
    req.user.id,
    "avatars",
    (await repo.avatarCount(req.user.id)).n,
  );
  await repo.deleteAvatar(a.id);
  if (a.owner_id === req.user.id)
    await store.refund(req.user.id, "inventory", "avatars", 1);
  await audit(req.user.id, "avatar.deleted", { id: a.id });
  res.json({ ok: true });
});
app.patch("/api/avatars/:id", auth, async (req, res) => {
  const a = await avatarFor(req.user, req.params.id);
  if (a.owner_id !== req.user.id && req.user.role !== "admin")
    fail(403, "You do not own this avatar");
  const v = parse(avatarSchema, { ...a, public: !!a.public, ...req.body });
  if (v.kind === "realistic" && !v.rights_confirmed)
    fail(400, "Portrait permission must be confirmed");
  if (v.public && req.user.role !== "admin")
    fail(403, "Only administrators can publish shared avatars");
  await assertImageAccess(req.user, v.image);
  await repo.updateAvatar(
    v.name,
    v.description,
    v.category,
    v.prompt,
    v.voice,
    Number(v.public),
    null,
    a.id,
  );
  await store.update(
    "avatars",
    { id: a.id },
    {
      kind: v.kind,
      rights_confirmed: v.rights_confirmed,
      image: v.image,
      color: v.color,
      ...(v.appearance ? { appearance: v.appearance } : {}),
    },
  );
  await audit(req.user.id, "avatar.updated", { id: a.id });
  res.json({ avatar: await avatarFor(req.user, a.id) });
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
app.post("/api/uploads", auth, upload.single("image"), async (req, res) => {
  if (!req.file) fail(400, "Choose a PNG, JPEG, or WebP image");
  const b = req.file.buffer;
  const ext = b
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "png"
    : b[0] === 255 && b[1] === 216 && b[2] === 255
      ? "jpg"
      : b.toString("ascii", 0, 4) === "RIFF" &&
          b.toString("ascii", 8, 12) === "WEBP"
        ? "webp"
        : null;
  if (!ext) fail(400, "Only PNG, JPEG, and WebP images are accepted");
  const filename = randomUUID() + ".png";
  const sharp = (await import("sharp")).default;
  let pixels;
  try {
    pixels = await sharp(b, { limitInputPixels: 32000000 })
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    fail(400, "The image is corrupt or exceeds 32 megapixels");
  }
  const undo = await reserveInventory(
    req.user,
    "assets",
    plans[req.user.plan].avatars * 4,
    await store.count("assets", { owner_id: req.user.id }),
  );
  try {
    writeFileSync(join(dataDir, "uploads", filename), pixels, { flag: "wx" });
    await store.insert("assets", {
      id: filename,
      owner_id: req.user.id,
      kind: req.body.kind === "realistic" ? "realistic" : "illustrated",
    });
  } catch (e) {
    rmSync(join(dataDir, "uploads", filename), { force: true });
    await undo();
    throw e;
  }
  res.status(201).json({ image: "/uploads/" + filename });
});
app.post("/api/avatars/generate", auth, async (req, res) => {
  const v = parse(
    z.object({
      prompt: z.string().min(10).max(2000),
      style: z.enum(["illustration", "realistic"]).default("illustration"),
    }),
    req.body,
  );
  const refund = await reserve(req.user, "images");
  let undoAsset, generatedFile;
  try {
    undoAsset = await reserveInventory(
      req.user,
      "assets",
      plans[req.user.plan].avatars * 4,
      await store.count("assets", { owner_id: req.user.id }),
    );
    if (!process.env.LOCAL_IMAGE_URL) {
      if (v.style === "realistic")
        throw unavailable("Realistic portrait generation");
      const image = await illustration(v.prompt);
      generatedFile = join(dataDir, image.slice(1));
      await store.insert("assets", {
        id: image.split("/").pop(),
        owner_id: req.user.id,
      });
      res.json({ image, procedural: true });
      return;
    }
    const r = await providerFetch(
      process.env.LOCAL_IMAGE_URL + "/sdapi/v1/txt2img",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: v.prompt, style: v.style }),
      },
    );
    const d = await r.json();
    if (!d.images?.[0]) fail(502, "Image model did not return a portrait");
    const filename = randomUUID() + ".png";
    generatedFile = join(dataDir, "uploads", filename);
    const pixels = Buffer.from(d.images[0], "base64");
    await (
      await import("sharp")
    )
      .default(pixels)
      .png()
      .toFile(join(dataDir, "uploads", filename));
    await store.insert("assets", {
      id: filename,
      owner_id: req.user.id,
      kind: v.style === "realistic" ? "realistic" : "illustrated",
    });
    res.json({
      image: "/uploads/" + filename,
      model: d.model,
      synthetic: true,
    });
  } catch (e) {
    if (generatedFile) rmSync(generatedFile, { force: true });
    if (undoAsset) await undoAsset();
    await refund();
    throw e;
  }
});
app.get("/api/assets", auth, async (req, res) =>
  res.json({
    assets: (
      await store.find(
        "assets",
        { owner_id: req.user.id },
        { sort: { created_at: -1 }, limit: req.query.all === "1" ? 400 : 30 },
      )
    ).map((a) => ({
      id: a.id,
      image: "/uploads/" + a.id,
      kind: a.kind || "illustrated",
      created_at: a.created_at,
    })),
  }),
);
app.delete("/api/assets/:id", auth, async (req, res) => {
  const asset = await store.one("assets", {
    id: req.params.id,
    owner_id: req.user.id,
  });
  if (!asset) fail(404, "Portrait not found");
  if (await store.one("avatars", { image: "/uploads/" + asset.id }))
    fail(409, "Remove avatars using this portrait before deleting it");
  await store.ensureInventory(
    req.user.id,
    "assets",
    await store.count("assets", { owner_id: req.user.id }),
  );
  if (
    !(await store.consumeOne("assets", { id: asset.id, owner_id: req.user.id }))
  )
    fail(404, "Portrait not found");
  rmSync(join(dataDir, "uploads", asset.id), { force: true });
  await store.refund(req.user.id, "inventory", "assets", 1);
  res.json({ ok: true });
});
app.get("/api/conversations", auth, async (req, res) =>
  res.json({ conversations: await repo.conversations(req.user.id) }),
);
app.get("/api/conversations/:id", auth, async (req, res) => {
  const c = await repo.conversation(req.params.id, req.user.id);
  if (!c) fail(404, "Conversation not found");
  res.json({ conversation: c, messages: await repo.messages(c.id) });
});
app.delete("/api/conversations/:id", auth, async (req, res) => {
  await repo.deleteConversation(req.params.id, req.user.id);
  res.json({ ok: true });
});
app.post(["/api/chat", "/api/v1/chat"], auth, async (req, res) => {
  const v = parse(
    z.object({
      avatar_id: z.string(),
      message: z.string().trim().min(1).max(8000),
      conversation_id: z.string().optional(),
    }),
    req.body,
  );
  const avatar = await avatarFor(req.user, v.avatar_id);
  if (req.apiKey && !plans[req.user.plan].api)
    fail(402, "API access requires a paid plan");
  let c = v.conversation_id
    ? await repo.avatarConversationFor(
        v.conversation_id,
        req.user.id,
        avatar.id,
      )
    : null;
  if (v.conversation_id && !c) fail(404, "Conversation not found");
  const history = c ? (await repo.history(c.id)).reverse() : [];
  const refund = await reserve(req.user, "messages");
  try {
    const result = await reply(
      avatar,
      [...history, { role: "user", content: v.message }],
      { userId: req.user.id },
    );
    if (!c) {
      c = { id: randomUUID() };
      await repo.createConversation(
        c.id,
        req.user.id,
        avatar.id,
        v.message.slice(0, 80),
      );
    }
    await store.messagesPair(c.id, v.message, result.content);
    res.json({
      ...result,
      conversation_id: c.id,
      usage: await userUsage(req.user.id),
    });
  } catch (e) {
    await refund();
    throw e;
  }
});
app.post(["/api/tts", "/api/v1/tts"], auth, async (req, res) => {
  const v = parse(
    z.object({
      text: z.string().min(1).max(4000),
      voice: z
        .enum(["coral", "alloy", "ash", "sage", "verse"])
        .default("coral"),
    }),
    req.body,
  );
  if (
    !process.env.LOCAL_SPEECH_URL &&
    (await settings(req.user.id)).tts === "local"
  )
    throw unavailable("Speech synthesis");
  const refund = await reserve(
    req.user,
    "voice",
    Math.max(1, Math.ceil(v.text.length / 900)),
  );
  try {
    res
      .type("audio/wav")
      .send(await speech(v.text, v.voice, { userId: req.user.id }));
  } catch (e) {
    await refund();
    throw e;
  }
});
app.post(
  ["/api/transcribe", "/api/v1/transcribe"],
  auth,
  upload.single("audio"),
  async (req, res) => {
    if (!process.env.LOCAL_SPEECH_URL)
      throw unavailable("Local speech recognition");
    if (!req.file) fail(400, "Upload an audio recording");
    const refund = await reserve(req.user, "voice");
    try {
      const r = await providerFetch(
        process.env.LOCAL_SPEECH_URL + "/transcribe",
        {
          method: "POST",
          headers: {
            "Content-Type": req.file.mimetype,
            "X-Language": (await settings(req.user.id)).language,
          },
          body: req.file.buffer,
        },
      );
      res.json(await r.json());
    } catch (e) {
      await refund();
      throw e;
    }
  },
);
app.get("/api/keys", auth, async (req, res) =>
  res.json({ keys: await repo.keys(req.user.id) }),
);
app.post("/api/keys", auth, apiAccess, async (req, res) => {
  const v = parse(z.object({ name: z.string().min(2).max(80) }), req.body);
  if ((await repo.keyCount(req.user.id)).n >= 10)
    fail(400, "Maximum 10 active keys");
  const key = "ps_" + randomBytes(32).toString("hex"),
    id = randomUUID();
  await repo.createKey(id, req.user.id, v.name, hash(key), key.slice(0, 10));
  res.status(201).json({ key, id });
});
app.delete("/api/keys/:id", auth, async (req, res) => {
  await repo.deleteKey(req.params.id, req.user.id);
  res.json({ ok: true });
});
app.get("/api/embeds", auth, async (req, res) =>
  res.json({ embeds: await repo.embeds(req.user.id) }),
);
app.post("/api/embeds", auth, apiAccess, async (req, res) => {
  const v = parse(z.object({ avatar_id: z.string() }), req.body);
  await avatarFor(req.user, v.avatar_id);
  if ((await repo.embedCount(req.user.id)).n >= 10)
    fail(400, "Maximum 10 embeds");
  const id = randomBytes(24).toString("hex");
  await repo.createEmbed(id, req.user.id, v.avatar_id);
  res.status(201).json({
    id,
    code: `<iframe src="${appUrl}/widget/${id}" width="380" height="560" title="AI assistant" style="border:0;border-radius:20px" loading="lazy"></iframe>`,
  });
});
app.delete("/api/embeds/:id", auth, async (req, res) => {
  await repo.deleteEmbed(req.params.id, req.user.id);
  res.json({ ok: true });
});
const embedLimit = rateLimit({
  windowMs: 60000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
app.get("/api/embed/:id/image", async (req, res) => {
  const e = await repo.embed(req.params.id);
  if (!e) fail(404, "Widget not found");
  const user = await repo.user(e.user_id);
  if (!plans[user.plan].api) fail(402, "Widget unavailable");
  const avatar = await avatarFor(user, e.avatar_id);
  res.sendFile(
    avatar.image.startsWith("/uploads/")
      ? join(dataDir, avatar.image.slice(1))
      : resolve("public" + avatar.image),
  );
});
app.get("/api/embed/:id", async (req, res) => {
  const e = await repo.embed(req.params.id);
  if (!e) fail(404, "Widget not found");
  const a = await avatarFor({ id: e.user_id }, e.avatar_id);
  res.json({
    avatar: {
      name: a.name,
      image: a.image.startsWith("/uploads/")
        ? "/api/embed/" + e.id + "/image"
        : a.image,
      kind: a.kind,
      description: a.description,
    },
    demo,
  });
});
app.post("/api/embed/:id/chat", embedLimit, async (req, res) => {
  const e = await repo.embed(req.params.id);
  if (!e) fail(404, "Widget not found");
  const user = await repo.user(e.user_id);
  if (!plans[user.plan].api) fail(402, "This widget is unavailable");
  const v = parse(
    z.object({
      message: z.string().trim().min(1).max(2000),
      history: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(2000),
          }),
        )
        .max(8)
        .default([]),
    }),
    req.body,
  );
  const a = await avatarFor(user, e.avatar_id);
  const refund = await reserve(user, "messages");
  try {
    res.json(
      await reply(a, [...v.history, { role: "user", content: v.message }], {
        userId: user.id,
        useKnowledge: false,
      }),
    );
  } catch (e) {
    await refund();
    throw e;
  }
});
app.post("/api/embed/:id/tts", embedLimit, async (req, res) => {
  const e = await repo.embed(req.params.id);
  if (!e) fail(404, "Widget not found");
  const user = await repo.user(e.user_id);
  if (!plans[user.plan].api) fail(402, "This widget is unavailable");
  const v = parse(z.object({ text: z.string().min(1).max(2000) }), req.body);
  const a = await avatarFor(user, e.avatar_id);
  const refund = await reserve(
    user,
    "voice",
    Math.max(1, Math.ceil(v.text.length / 900)),
  );
  try {
    res
      .type("audio/wav")
      .send(await speech(v.text, a.voice, { userId: user.id }));
  } catch (e) {
    await refund();
    throw e;
  }
});
app.get(["/api/videos", "/api/v1/videos"], auth, async (req, res) => {
  const rows = await repo.videos(req.user.id);
  res.json({ videos: rows });
});
app.post(["/api/videos", "/api/v1/videos"], auth, async (req, res) => {
  const v = parse(
    z.object({
      avatar_id: z.string(),
      script: z.string().trim().min(10).max(1000),
      compute: z.enum(["cpu", "gpu"]).optional(),
      quality: z.enum(["fast", "neural"]).optional(),
    }),
    req.body,
  );
  const a = await avatarFor(req.user, v.avatar_id);
  const prefs = await settings(req.user.id),
    compute = v.compute || prefs.compute,
    quality = v.quality || prefs.quality;
  if (prefs.video === "local" && a.kind === "realistic")
    await requireCompute(compute, quality);
  if (
    process.env.LOCAL_SPEECH_URL ||
    prefs.tts !== "local" ||
    prefs.video === "heygen"
  ) {
    if (!claimRenderer())
      fail(429, "A video is currently rendering. Try again shortly.");
    let refund;
    try {
      refund = await reserve(req.user, "videos");
      const id = randomUUID();
      await repo.createVideo(
        id,
        req.user.id,
        a.id,
        v.script,
        "processing",
        prefs.video,
      );
      await store.update("videos", { id }, { compute, quality });
      if (prefs.video === "heygen")
        renderHeyGen(id, req.user, a, v.script, refund).finally(
          releaseRenderer,
        );
      else
        renderLocalVideo(id, req.user, a, v.script, refund, {
          compute,
          quality,
        });
      res.status(202).json({ id, status: "processing" });
    } catch (e) {
      releaseRenderer();
      if (refund) await refund();
      throw e;
    }
    return;
  }
  throw unavailable("Local video rendering");
});
app.get("/api/videos/:id/download", auth, async (req, res) => {
  const v = await repo.video(req.params.id, req.user.id);
  if (!v || v.status !== "completed") fail(404, "Video not found");
  await videoDownload(req, res, v);
});
app.get("/api/videos/:id", auth, async (req, res) => {
  const v = await repo.video(req.params.id, req.user.id);
  if (!v) fail(404, "Video not found");
  res.json({ video: v });
});
app.post("/api/billing/checkout", auth, async (req, res) => {
  const { plan } = parse(
    z.object({ plan: z.enum(["pro", "business"]) }),
    req.body,
  );
  if (!providers().billing) throw unavailable("Stripe billing");
  if (req.user.plan !== "free" && req.user.stripe_customer)
    fail(409, "Manage your existing subscription in the billing portal");
  let customer = req.user.stripe_customer;
  if (!customer) {
    const c = await stripe.customers.create(
      { email: req.user.email, metadata: { user_id: req.user.id } },
      { idempotencyKey: "customer-" + req.user.id },
    );
    customer = c.id;
    await repo.setCustomer(customer, req.user.id);
  }
  const s = await stripe.checkout.sessions.create({
    customer,
    mode: "subscription",
    line_items: [
      {
        price:
          plan === "pro"
            ? process.env.STRIPE_PRO_PRICE_ID
            : process.env.STRIPE_BUSINESS_PRICE_ID,
        quantity: 1,
      },
    ],
    success_url: appUrl + "/billing?success=1",
    cancel_url: appUrl + "/billing",
    client_reference_id: req.user.id,
  });
  res.json({ url: s.url });
});
app.post("/api/billing/portal", auth, async (req, res) => {
  if (!stripe) throw unavailable("Stripe billing");
  if (!req.user.stripe_customer) fail(400, "No billing account exists yet");
  const s = await stripe.billingPortal.sessions.create({
    customer: req.user.stripe_customer,
    return_url: appUrl + "/billing",
  });
  res.json({ url: s.url });
});
app.get("/api/admin/overview", auth, admin, async (req, res) =>
  res.json({
    users: await repo.users(),
    audit: await repo.audit(),
    stats: {
      users: (await repo.userCount()).n,
      avatars: (await repo.allAvatarCount()).n,
      conversations: (await repo.conversationCount()).n,
      videos: (await repo.videoCount()).n,
    },
    providers: providers(),
  }),
);
app.patch("/api/admin/users/:id", auth, admin, async (req, res) => {
  const v = parse(
    z.object({
      plan: z.enum(["free", "pro", "business"]).optional(),
      role: z.enum(["customer", "admin"]).optional(),
    }),
    req.body,
  );
  const u = await repo.user(req.params.id);
  if (!u) fail(404, "User not found");
  if (u.id === req.user.id && v.role === "customer")
    fail(400, "You cannot remove your own administrator access");
  await repo.updateUser(v.role || u.role, v.plan || u.plan, u.id);
  await audit(req.user.id, "user.updated", { user_id: u.id, ...v });
  res.json({ ok: true });
});
app.use("/uploads/:filename", async (req, res, next) => {
  const filename = req.params.filename;
  if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(filename)) {
    res.status(404).end();
    return;
  }
  const cookie = req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("persona_session="))
    ?.slice(16);
  const session = cookie ? await repo.session(hash(cookie), Date.now()) : null;
  const actor = session ? await repo.user(session.user_id) : null;
  const asset = await store.one("assets", { id: filename }),
    references = await store.find("avatars", { image: "/uploads/" + filename });
  if (
    actor?.role === "admin" ||
    references.some((a) => a.public) ||
    (session &&
      (asset?.owner_id === session.user_id ||
        references.some((a) => a.owner_id === session.user_id)))
  ) {
    next();
    return;
  }
  res.status(404).end();
});
app.use(
  "/uploads",
  express.static(join(dataDir, "uploads"), {
    dotfiles: "deny",
    setHeaders: (res) => res.set("X-Content-Type-Options", "nosniff"),
  }),
);
app.get("/widget/:id", async (req, res) => {
  if (!(await repo.embed(req.params.id))) fail(404, "Widget not found");
  res.removeHeader("X-Frame-Options");
  res.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self'; frame-ancestors *",
  );
  res.sendFile(resolve("public/widget.html"));
});
app.use("/avatars", (req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  next();
});
app.use(express.static(resolve("public")));
app.use("/api", (req, res) =>
  res.status(404).json({ error: "API endpoint not found" }),
);
if (existsSync("dist/index.html")) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
}
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  if (status >= 500) console.error("Request failure:", err.status || 500);
  res.status(status).json({
    error: status === 500 ? "An unexpected error occurred" : err.message,
  });
});
async function recoverLocalJobs() {
  if (!process.env.LOCAL_SPEECH_URL) return;
  const pending = await store.find("videos", { status: "processing" });
  for (const job of pending) {
    while (rendererBusy()) await new Promise((r) => setTimeout(r, 500));
    claimRenderer();
    const user = await repo.user(job.user_id),
      avatar = await repo.avatar(job.avatar_id);
    if (!user || !avatar) {
      await repo.videoFailed(
        "failed",
        "The avatar or account is unavailable.",
        job.id,
      );
      releaseRenderer();
      continue;
    }
    const refund = () =>
      store.refund(user.id, job.created_at.slice(0, 7), "videos", 1);
    if (job.provider_id === "heygen") {
      await renderHeyGen(
        job.id,
        user,
        avatar,
        job.script,
        refund,
        job.external_id,
      );
      releaseRenderer();
    } else
      await renderLocalVideo(job.id, user, avatar, job.script, refund, {
        compute: job.compute || "cpu",
        quality: job.quality || "neural",
      });
  }
}
recoverLocalJobs().catch(() => console.error("Could not recover video jobs"));
const server = app.listen(port, "0.0.0.0", () =>
  console.log(
    `BENAI listening on port ${port}; demo mode ${demo ? "enabled" : "disabled"}`,
  ),
);
const realtime = attachRealtime(server);
function stop() {
  for (const client of realtime.clients)
    client.close(1001, "Server restarting");
  server.close(() => {
    store.close().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
