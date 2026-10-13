import { store } from "./storage.js";
const one = (c, q) => store.one(c, q),
  find = (c, q = {}, o = {}) => store.find(c, q, o),
  insert = (c, d) => store.insert(c, d),
  update = (c, q, v) => store.update(c, q, v),
  remove = (c, q) => store.remove(c, q);
const desc = { sort: { created_at: -1, id: -1 } },
  asc = { sort: { created_at: 1, id: 1 } };
const pick = (row, fields) =>
  Object.fromEntries(fields.map((f) => [f, row[f]]));
async function joined(c, userId) {
  const rows = await find(c, { user_id: userId }, { ...desc, limit: 100 });
  return Promise.all(
    rows.map(async (r) => {
      const a = await one("avatars", { id: r.avatar_id });
      return {
        ...r,
        avatar_name: a?.name,
        name: a?.name,
        avatar_image: a?.image,
      };
    }),
  );
}
export const repo = {
  planByCustomer: (plan, customer) =>
    update("users", { stripe_customer: customer }, { plan }),
  apiByHash: (hash) => one("api_keys", { hash }),
  user: (id) => one("users", { id }),
  session: (token, now) => one("sessions", { token, expires: { $gt: now } }),
  expireSessions: (now) => remove("sessions", { expires: { $lt: now } }),
  createSession: (token, user_id, csrf, expires) =>
    insert("sessions", { id: token, token, user_id, csrf, expires }),
  userByEmail: (email) => one("users", { email }),
  createUser: (id, email, name, password) =>
    insert("users", {
      id,
      email,
      name,
      password,
      role: "customer",
      plan: "free",
    }),
  deleteSession: (token) => remove("sessions", { token }),
  avatar: (id) => one("avatars", { id }),
  avatars: () => find("avatars", {}, asc),
  visibleAvatars: (user_id) =>
    find("avatars", { $or: [{ public: 1 }, { owner_id: user_id }] }, asc),
  avatarCount: async (owner_id) => ({
    n: await store.count("avatars", { owner_id }),
  }),
  createAvatar: (
    id,
    owner_id,
    name,
    description,
    category,
    image,
    color,
    prompt,
    voice,
    pub,
    provider_avatar_id,
  ) =>
    insert("avatars", {
      id,
      owner_id,
      name,
      description,
      category,
      image,
      color,
      prompt,
      voice,
      public: pub,
      provider_avatar_id,
    }),
  avatarConversation: (avatar_id) => one("conversations", { avatar_id }),
  avatarVideo: (avatar_id) => one("videos", { avatar_id }),
  deleteAvatarEmbeds: (avatar_id) => remove("embeds", { avatar_id }),
  deleteAvatar: (id) => remove("avatars", { id }),
  updateAvatar: (
    name,
    description,
    category,
    prompt,
    voice,
    pub,
    provider_avatar_id,
    id,
  ) =>
    update(
      "avatars",
      { id },
      {
        name,
        description,
        category,
        prompt,
        voice,
        public: pub,
        provider_avatar_id,
      },
    ),
  conversations: (user_id) => joined("conversations", user_id),
  conversation: (id, user_id) => one("conversations", { id, user_id }),
  messages: (conversation_id) =>
    find("messages", { conversation_id }, { sort: { seq: 1 } }),
  deleteConversation: async (id, user_id) => {
    if (await one("conversations", { id, user_id })) {
      await remove("messages", { conversation_id: id });
      await remove("conversations", { id, user_id });
    }
  },
  avatarConversationFor: (id, user_id, avatar_id) =>
    one("conversations", { id, user_id, avatar_id }),
  history: async (conversation_id) =>
    (
      await find(
        "messages",
        { conversation_id },
        { sort: { seq: -1 }, limit: 20 },
      )
    ).map((r) => ({ role: r.role, content: r.content })),
  createConversation: (id, user_id, avatar_id, title) =>
    insert("conversations", { id, user_id, avatar_id, title }),
  keys: async (user_id) =>
    (await find("api_keys", { user_id })).map((r) =>
      pick(r, ["id", "name", "prefix", "created_at"]),
    ),
  keyCount: async (user_id) => ({
    n: await store.count("api_keys", { user_id }),
  }),
  createKey: (id, user_id, name, hash, prefix) =>
    insert("api_keys", { id, user_id, name, hash, prefix }),
  deleteKey: (id, user_id) => remove("api_keys", { id, user_id }),
  embeds: (user_id) => joined("embeds", user_id),
  embedCount: async (user_id) => ({
    n: await store.count("embeds", { user_id }),
  }),
  createEmbed: (id, user_id, avatar_id) =>
    insert("embeds", { id, user_id, avatar_id }),
  deleteEmbed: (id, user_id) => remove("embeds", { id, user_id }),
  embed: (id) => one("embeds", { id }),
  videos: (user_id) => joined("videos", user_id),
  createVideo: (id, user_id, avatar_id, script, status, provider_id) =>
    insert("videos", { id, user_id, avatar_id, script, status, provider_id }),
  video: (id, user_id) => one("videos", { id, user_id }),
  videoComplete: (status, url, id) => update("videos", { id }, { status, url }),
  videoFailed: (status, error, id) =>
    update("videos", { id }, { status, error }),
  setCustomer: (stripe_customer, id) =>
    update("users", { id }, { stripe_customer }),
  users: async () =>
    (await find("users", {}, desc)).map((r) =>
      pick(r, ["id", "name", "email", "role", "plan", "created_at"]),
    ),
  audit: () => find("audit", {}, { ...desc, limit: 50 }),
  userCount: async () => ({ n: await store.count("users") }),
  allAvatarCount: async () => ({ n: await store.count("avatars") }),
  conversationCount: async () => ({ n: await store.count("conversations") }),
  videoCount: async () => ({ n: await store.count("videos") }),
  updateUser: (role, plan, id) => update("users", { id }, { role, plan }),
};
