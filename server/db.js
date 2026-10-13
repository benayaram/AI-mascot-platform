import { store, dataDir } from "./storage.js";
import { existsSync } from "node:fs";
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
for (const [id, name, description, category, prompt] of [
  [
    "amara",
    "Amara",
    "A realistic AI host for thoughtful, warm conversations.",
    "Companion",
    "You are Amara, a thoughtful AI host. Answer briefly, honestly, and warmly. Do not pretend to be a real human.",
  ],
  [
    "milo",
    "Milo",
    "A clear, friendly guide for your customers and your ideas.",
    "Support",
    "You are Milo, a friendly support assistant. Explain clearly and ask for details when needed. Keep voice replies concise.",
  ],
  [
    "elena",
    "Elena",
    "An approachable teacher with a realistic digital presence.",
    "Education",
    "You are Elena, an encouraging tutor. Use simple examples and keep answers concise for voice conversations.",
  ],
])
  if (
    existsSync("public/realistic/" + id + ".png") &&
    !(await store.one("avatars", { id }))
  )
    await store.insert("avatars", {
      id,
      name,
      description,
      category,
      prompt,
      owner_id: null,
      kind: "realistic",
      rights_confirmed: true,
      image: "/realistic/" + id + ".png",
      color: "#e7ddfc",
      voice: id === "milo" ? "ash" : "coral",
      public: 1,
    });
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

export async function reserveInventory(user, kind, limit, initial) {
  await store.ensureInventory(user.id, kind, initial);
  if (!(await store.reserve(user.id, "inventory", kind, 1, limit))) {
    const e = new Error("Your " + kind + " inventory limit is reached");
    e.status = 402;
    throw e;
  }
  return () => store.refund(user.id, "inventory", kind, 1);
}
