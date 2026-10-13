import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { store, dataDir } from "./storage.js";
import { r2 } from "./media.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
const hash = (v) => createHash("sha256").update(v).digest("hex");
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.SMTP_HOST || !process.env.MAIL_FROM)
)
  throw Error(
    "Production requires SMTP_HOST and MAIL_FROM for account verification and recovery",
  );
const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      requireTLS:
        process.env.NODE_ENV === "production" &&
        process.env.SMTP_SECURE !== "true",
      tls: { minVersion: "TLSv1.2" },
      ...(process.env.SMTP_USER
        ? {
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD,
            },
          }
        : {}),
      connectionTimeout: 10000,
      socketTimeout: 15000,
    })
  : null;
const capture =
  process.env.NODE_ENV !== "production" ? process.env.MAIL_CAPTURE_DIR : null;
export const mailAvailable = () => !!(transport || capture);
export function passwordMatches(value, user) {
  const [salt, key] = user.password.split(":");
  return timingSafeEqual(scryptSync(value, salt, 64), Buffer.from(key, "hex"));
}
export async function sendAccountMail(user, purpose, appUrl) {
  if (!mailAvailable())
    throw Object.assign(
      Error(
        "Email delivery is not configured. Ask the administrator to connect SMTP.",
      ),
      { status: 503 },
    );
  const token = randomBytes(32).toString("hex"),
    id = hash(token),
    url =
      appUrl +
      (purpose === "reset" ? "/reset-password" : "/verify-email") +
      "?token=" +
      token;
  await store.remove("account_tokens", { expires: { $lt: Date.now() } });
  await store.remove("account_tokens", { user_id: user.id, purpose });
  await store.insert("account_tokens", {
    id,
    user_id: user.id,
    purpose,
    expires: Date.now() + (purpose === "reset" ? 30 : 1440) * 60000,
  });
  const message = {
    from: process.env.MAIL_FROM || "BENAI <noreply@localhost>",
    to: user.email,
    subject:
      purpose === "reset"
        ? "Reset your BENAI password"
        : "Verify your BENAI email",
    text: `${purpose === "reset" ? "Reset your password" : "Verify your email"} using this one-use link:\n${url}\n\nIf you did not request this, ignore this email.`,
  };
  try {
    if (transport) await transport.sendMail(message);
    else {
      mkdirSync(capture, { recursive: true, mode: 0o700 });
      writeFileSync(join(capture, id + ".json"), JSON.stringify(message), {
        mode: 0o600,
      });
    }
  } catch {
    await store.remove("account_tokens", { id });
    throw Object.assign(
      Error("Email delivery failed. Please try again later."),
      { status: 503 },
    );
  }
}
export function installAccountRoutes({
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
}) {
  const cookieOnly = (req, res, next) =>
    req.apiKey
      ? res.status(403).json({ error: "Sign in to manage your account" })
      : next();
  app.post("/api/auth/forgot-password", loginLimiter, async (req, res) => {
    const v = parse(z.object({ email }), req.body);
    if (!mailAvailable())
      fail(
        503,
        "Email delivery is not configured. Contact your administrator.",
      );
    const user = await store.one("users", { email: v.email });
    if (user)
      await sendAccountMail(user, "reset", appUrl).catch(() =>
        audit(user.id, "email.delivery_failed", {}),
      );
    res.json({
      ok: true,
      message: "If that account exists, a password reset email has been sent.",
    });
  });
  app.post("/api/auth/reset-password", loginLimiter, async (req, res) => {
    const v = parse(
      z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password }),
      req.body,
    );
    const token = await store.consumeOne("account_tokens", {
      id: hash(v.token),
      purpose: "reset",
      expires: { $gt: Date.now() },
    });
    if (!token)
      fail(400, "This reset link is expired or has already been used");
    await store.update(
      "users",
      { id: token.user_id },
      { password: passwordHash(v.password) },
    );
    await store.remove("sessions", { user_id: token.user_id });
    await store.remove("api_keys", { user_id: token.user_id });
    await audit(token.user_id, "password.reset", {});
    res.json({ ok: true });
  });
  app.post(
    "/api/auth/request-verification",
    auth,
    cookieOnly,
    loginLimiter,
    async (req, res) => {
      if (req.user.email_verified) return res.json({ ok: true });
      await sendAccountMail(req.user, "verify", appUrl);
      res.json({ ok: true });
    },
  );
  app.post("/api/auth/verify-email", loginLimiter, async (req, res) => {
    const { token: value } = parse(
      z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }),
      req.body,
    );
    const token = await store.consumeOne("account_tokens", {
      id: hash(value),
      purpose: "verify",
      expires: { $gt: Date.now() },
    });
    if (!token)
      fail(400, "This verification link is expired or has already been used");
    await store.update(
      "users",
      { id: token.user_id },
      { email_verified: true },
    );
    res.json({ ok: true });
  });
  app.get("/api/account/export", auth, cookieOnly, async (req, res) => {
    const id = req.user.id,
      { password: ignored, stripe_customer: customer, ...user } = req.user;
    const conversations = await store.find("conversations", { user_id: id }),
      messages = [];
    for (const c of conversations)
      messages.push(
        ...(await store.find("messages", { conversation_id: c.id })),
      );
    const data = {
      user,
      avatars: await store.find("avatars", { owner_id: id }),
      conversations,
      messages,
      videos: (await store.find("videos", { user_id: id })).map(
        ({ storage_key, external_id, ...v }) => v,
      ),
      leads: await store.find("leads", { user_id: id }),
      demos: await store.find("demos", { user_id: id }),
      settings: await store.one("customer_settings", { id }),
      usage: await store.find("usage", { user_id: id }),
    };
    res
      .set("Content-Disposition", 'attachment; filename="benai-account.json"')
      .json(data);
  });
  app.delete("/api/account", auth, cookieOnly, async (req, res) => {
    const v = parse(
      z.object({
        password: z.string().min(1).max(128),
        confirmation: z.literal("DELETE"),
      }),
      req.body,
    );
    if (!passwordMatches(v.password, req.user)) fail(401, "Incorrect password");
    if (req.user.role === "admin")
      fail(
        409,
        "Transfer administrator ownership and change this account to a customer before deleting it",
      );
    if (req.user.stripe_customer && req.user.plan !== "free")
      fail(
        409,
        "Cancel your paid subscription in the billing portal before deleting your account",
      );
    if (
      await store.one("videos", { user_id: req.user.id, status: "processing" })
    )
      fail(409, "Wait for your active video job before deleting the account");
    const id = req.user.id;
    for (const video of await store.find("videos", { user_id: id })) {
      if (video.storage_key && r2)
        await r2.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: video.storage_key,
          }),
        );
      rmSync(join(dataDir, "videos", video.id + ".mp4"), { force: true });
    }
    for (const asset of await store.find("assets", { owner_id: id }))
      rmSync(join(dataDir, "uploads", asset.id), { force: true });
    for (const c of await store.find("conversations", { user_id: id }))
      await store.remove("messages", { conversation_id: c.id });
    for (const collection of [
      "sessions",
      "api_keys",
      "provider_credentials",
      "account_tokens",
      "conversations",
      "videos",
      "embeds",
      "demos",
      "demo_events",
      "leads",
      "usage",
    ])
      await store.remove(collection, { user_id: id });
    await store.remove("assets", { owner_id: id });
    await store.remove("avatars", { owner_id: id });
    await store.remove("customer_settings", { id });
    await store.remove("users", { id });
    await store.remove("audit", { actor_id: id });
    res.clearCookie("persona_session", { path: "/" }).json({ ok: true });
  });
}
