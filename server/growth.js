import { randomBytes, createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { store, dataDir } from "./storage.js";
import { reserve, reserveInventory } from "./db.js";
import { reply } from "./providers.js";
export const templates = [
  {
    id: "local-business",
    name: "Local business guide",
    description: "Answer opening hours, services, and booking questions.",
    avatar: "sage",
    prompt:
      "You are a friendly business assistant. Answer only from the business facts. Ask one useful follow-up question and suggest contacting the business when information is missing.",
  },
  {
    id: "shop-helper",
    name: "Shop assistant",
    description: "Explain products, delivery, returns, and next steps.",
    avatar: "milo",
    prompt:
      "You are a concise shop assistant. Use only the provided product and policy facts. Do not invent discounts, stock or guarantees. Help visitors choose a useful next step.",
  },
  {
    id: "course-tutor",
    name: "Course tutor",
    description: "Help learners understand your course and lessons.",
    avatar: "elena",
    prompt:
      "You are an encouraging tutor. Explain the provided course facts with short examples. When facts are missing, say so. Do not promise qualifications or outcomes.",
  },
  {
    id: "creative-host",
    name: "Creator host",
    description: "Introduce your content and collect interested visitors.",
    avatar: "nova",
    prompt:
      "You are a warm creator assistant. Introduce the provided projects accurately, answer briefly, and invite interested visitors to leave their contact details using the lead form.",
  },
];
export const referralCode = (id) =>
  createHash("sha256")
    .update("benai-ref:" + id)
    .digest("hex")
    .slice(0, 12);
export function installGrowthRoutes({
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
}) {
  const limiter = rateLimit({
    windowMs: 60000,
    limit: 12,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const published = async (id) => {
    const demo = await store.one("demos", { id, active: true });
    if (!demo) fail(404, "Demo not found");
    const user = await store.one("users", { id: demo.user_id });
    if (!user) fail(404, "Demo not found");
    if (
      (process.env.NODE_ENV === "production" ||
        process.env.REQUIRE_VERIFIED_EMAIL === "true") &&
      !user.email_verified
    )
      fail(404, "Demo unavailable");
    return { demo, user, avatar: await avatarFor(user, demo.avatar_id) };
  };
  app.get("/api/templates", auth, async (req, res) => res.json({ templates }));
  app.post("/api/templates/:id/use", auth, async (req, res) => {
    const template = templates.find((t) => t.id === req.params.id);
    if (!template) fail(404, "Template not found");
    const v = parse(
      z.object({
        name: z.string().trim().min(2).max(80),
        facts: z.string().trim().min(10).max(4000),
      }),
      req.body,
    );
    const { plans } = await import("./plans.js"),
      base = await store.one("avatars", { id: template.avatar });
    const refund = await reserveInventory(
      req.user,
      "avatars",
      plans[req.user.plan].avatars,
      await store.count("avatars", { owner_id: req.user.id }),
    );
    try {
      const avatar = await store.insert("avatars", {
        owner_id: req.user.id,
        name: v.name,
        description: template.description,
        category: "Business",
        image: base.image,
        color: base.color,
        voice: base.voice,
        kind: base.kind || "illustrated",
        rights_confirmed: base.rights_confirmed || false,
        prompt: template.prompt,
        knowledge_text: v.facts,
        public: 0,
      });
      res.status(201).json({ avatar });
    } catch (e) {
      await refund();
      throw e;
    }
  });
  app.get("/api/growth", auth, async (req, res) => {
    if (!req.user.referral_code)
      await store.update(
        "users",
        { id: req.user.id },
        { referral_code: referralCode(req.user.id) },
      );
    const demos = await store.find("demos", { user_id: req.user.id }),
      leads = await store.find(
        "leads",
        { user_id: req.user.id },
        { sort: { created_at: -1 }, limit: 100 },
      ),
      events = await store.find("demo_events", {
        user_id: req.user.id,
        expires: { $gt: Date.now() },
      });
    res.json({
      demos,
      leads,
      referral_url: appUrl + "/?ref=" + referralCode(req.user.id),
      stats: {
        visitors: events.filter((e) => e.kind === "visit").length,
        turns: events.filter((e) => e.kind === "chat").length,
        leads: await store.count("leads", { user_id: req.user.id }),
        referred_signups: await store.count("users", {
          referred_by: req.user.id,
        }),
      },
    });
  });
  app.post("/api/demos", auth, async (req, res) => {
    const v = parse(
      z.object({
        avatar_id: z.string(),
        title: z.string().trim().min(2).max(100),
        description: z.string().trim().max(300),
        accept_public: z.literal(true),
      }),
      req.body,
    );
    await avatarFor(req.user, v.avatar_id);
    if ((await store.count("demos", { user_id: req.user.id })) >= 3)
      fail(400, "Maximum three demo pages. Reuse or revoke an existing page.");
    if (
      (process.env.NODE_ENV === "production" ||
        process.env.REQUIRE_VERIFIED_EMAIL === "true") &&
      !req.user.email_verified
    )
      fail(403, "Verify your email before publishing a demo");
    const id = randomBytes(24).toString("hex");
    const demo = await store.insert("demos", {
      id,
      user_id: req.user.id,
      ...v,
      active: true,
    });
    await audit(req.user.id, "demo.created", { id });
    res.status(201).json({ demo, url: appUrl + "/d/" + id });
  });
  app.delete("/api/demos/:id", auth, async (req, res) => {
    await store.update(
      "demos",
      { id: req.params.id, user_id: req.user.id },
      { active: false },
    );
    res.json({ ok: true });
  });
  app.delete("/api/leads/:id", auth, async (req, res) => {
    await store.remove("leads", { id: req.params.id, user_id: req.user.id });
    res.json({ ok: true });
  });
  app.get("/api/public-demo/:id", limiter, async (req, res) => {
    const { demo, user, avatar } = await published(req.params.id);
    res.json({
      title: demo.title,
      description: demo.description,
      avatar: {
        name: avatar.name,
        kind: avatar.kind,
        image: "/api/public-demo/" + demo.id + "/image",
      },
      referral: referralCode(user.id),
    });
  });
  app.get("/api/public-demo/:id/image", async (req, res) => {
    const { avatar } = await published(req.params.id);
    res.sendFile(
      avatar.image.startsWith("/uploads/")
        ? join(dataDir, avatar.image.slice(1))
        : resolve("public" + avatar.image),
    );
  });
  app.post("/api/public-demo/:id/visit", limiter, async (req, res) => {
    const { demo, user } = await published(req.params.id),
      v = parse(
        z.object({ visitor: z.string().regex(/^[a-zA-Z0-9-]{16,64}$/) }),
        req.body,
      );
    await store.remove("demo_events", { expires: { $lt: Date.now() } });
    const id = createHash("sha256")
      .update(demo.id + v.visitor)
      .digest("hex");
    try {
      await store.insert("demo_events", {
        id,
        user_id: user.id,
        demo_id: demo.id,
        kind: "visit",
        expires: Date.now() + 30 * 86400000,
      });
    } catch (e) {
      if (e.code !== 11000 && ![1555, 2067].includes(e.errcode)) throw e;
    }
    res.json({ ok: true });
  });
  app.post("/api/public-demo/:id/chat", limiter, async (req, res) => {
    const { demo, user, avatar } = await published(req.params.id),
      v = parse(
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
    const refund = await reserve(user, "messages");
    try {
      const result = await reply(
        avatar,
        [...v.history, { role: "user", content: v.message }],
        { userId: user.id, useKnowledge: false },
      );
      await store.insert("demo_events", {
        user_id: user.id,
        demo_id: demo.id,
        kind: "chat",
        expires: Date.now() + 30 * 86400000,
      });
      res.json(result);
    } catch (e) {
      await refund();
      throw e;
    }
  });
  app.post("/api/public-demo/:id/leads", limiter, async (req, res) => {
    const { demo, user } = await published(req.params.id),
      v = parse(
        z.object({
          name: z.string().trim().min(2).max(80),
          email,
          message: z.string().trim().max(1000).default(""),
          consent: z.literal(true),
        }),
        req.body,
      );
    if ((await store.count("leads", { user_id: user.id })) >= 1000)
      fail(
        429,
        "This lead inbox is full. Please contact the business directly.",
      );
    await store.insert("leads", {
      ...v,
      user_id: user.id,
      demo_id: demo.id,
      consented_at: new Date().toISOString(),
    });
    res.status(201).json({ ok: true });
  });
}
