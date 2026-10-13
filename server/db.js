import { store, dataDir } from "./storage.js";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
export { store, dataDir };
export function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export const presets = [
  [
    "nova",
    "Nova",
    "A curious creative partner with a spark of imagination.",
    "Creative",
    "#e7ddfc",
    "You are Nova, a warm creative collaborator. Help brainstorm, write and explore ideas.",
  ],
  [
    "atlas",
    "Atlas",
    "Your calm, thoughtful guide to everything technical.",
    "Support",
    "#d9eef3",
    "You are Atlas, a patient technical support guide. Give clear, accurate steps and ask clarifying questions.",
  ],
  [
    "luna",
    "Luna",
    "A friendly companion for learning something new.",
    "Education",
    "#fce6d5",
    "You are Luna, an encouraging tutor. Teach with examples and guide learners rather than simply giving answers.",
  ],
  [
    "pixel",
    "Pixel",
    "Big personality. Endless ideas. A little bit of magic.",
    "Creative",
    "#dcf0df",
    "You are Pixel, a playful brainstorming mascot. Be helpful, witty and concise.",
  ],
  [
    "sage",
    "Sage",
    "A welcoming face for your brand and your customers.",
    "Business",
    "#f8dce5",
    "You are Sage, a friendly business assistant. Help customers understand products and services without inventing facts.",
  ],
  [
    "orbit",
    "Orbit",
    "An upbeat digital companion, ready for any adventure.",
    "Companion",
    "#e1e5fc",
    "You are Orbit, an upbeat conversational companion. Be kind, respectful and thoughtful.",
  ],
];
for (const [id, name, description, category, color, prompt] of presets) {
  if (!(await store.one("avatars", { id })))
    await store.insert("avatars", {
      id,
      owner_id: null,
      name,
      description,
      category,
      color,
      prompt,
      image: `/avatars/${id}.svg`,
      public: 1,
      voice: "coral",
    });
}
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  if (process.env.ADMIN_PASSWORD.length < 12)
    throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
  if (!(await store.one("users", { email })))
    await store.insert("users", {
      email,
      name: "Administrator",
      password: passwordHash(process.env.ADMIN_PASSWORD),
      role: "admin",
      plan: "business",
    });
}
export async function audit(actor_id, action, detail) {
  await store.insert("audit", {
    actor_id,
    action,
    detail: JSON.stringify(detail),
  });
}
export { plans } from "./plans.js";
import { plans } from "./plans.js";
export async function reserve(user, kind, n = 1) {
  const limit = plans[user.plan]?.[kind] ?? 0,
    period = new Date().toISOString().slice(0, 7);
  if (!(await store.reserve(user.id, period, kind, n, limit))) {
    const e = new Error(
      `Monthly ${kind} limit reached. Upgrade your plan or wait for the next month.`,
    );
    e.status = 402;
    throw e;
  }
  let refunded = false;
  return async () => {
    if (!refunded) {
      refunded = true;
      await store.refund(user.id, period, kind, n);
    }
  };
}
export async function userUsage(id) {
  return store.usage(id, new Date().toISOString().slice(0, 7));
}
