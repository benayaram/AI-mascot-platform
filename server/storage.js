import { DatabaseSync } from "node:sqlite";
import { MongoClient } from "mongodb";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
export const dataDir = resolve(process.env.DATA_DIR || ".data");
mkdirSync(join(dataDir, "uploads"), { recursive: true });
mkdirSync(join(dataDir, "videos"), { recursive: true });
mkdirSync(join(dataDir, "tmp"), { recursive: true });
const mongo = process.env.MONGODB_URI
  ? new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
    })
  : null;
let local, remote;
if (mongo) {
  await mongo.connect();
  remote = mongo.db(process.env.MONGODB_DB || "benai");
  await remote.collection("users").createIndex({ email: 1 }, { unique: true });
  await remote
    .collection("api_keys")
    .createIndex({ hash: 1 }, { unique: true });
  await remote
    .collection("sessions")
    .createIndex({ token: 1 }, { unique: true });
  await remote
    .collection("usage")
    .createIndex({ user_id: 1, period: 1, kind: 1 }, { unique: true });
  for (const name of [
    "avatars",
    "conversations",
    "messages",
    "api_keys",
    "videos",
    "embeds",
  ])
    await remote.collection(name).createIndex({ user_id: 1 });
} else {
  local = new DatabaseSync(join(dataDir, "benai.sqlite"));
  local.exec(
    `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS documents (collection TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(collection,id)); CREATE UNIQUE INDEX IF NOT EXISTS user_email ON documents(json_extract(body,'$.email')) WHERE collection='users'; CREATE UNIQUE INDEX IF NOT EXISTS key_hash ON documents(json_extract(body,'$.hash')) WHERE collection='api_keys'; CREATE TABLE IF NOT EXISTS usage(user_id TEXT,period TEXT,kind TEXT,count INTEGER NOT NULL,PRIMARY KEY(user_id,period,kind));`,
  );
}
function matches(row, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === "$or") return value.some((v) => matches(row, v));
    if (value && typeof value === "object") {
      if ("$gt" in value) return row[key] > value.$gt;
      if ("$lt" in value) return row[key] < value.$lt;
      if ("$in" in value) return value.$in.includes(row[key]);
    }
    return row[key] === value;
  });
}
export const store = {
  async find(collection, query = {}, options = {}) {
    if (remote) {
      let c = remote
        .collection(collection)
        .find(query, { projection: { _id: 0 } });
      if (options.sort) c = c.sort(options.sort);
      if (options.limit) c = c.limit(options.limit);
      return c.toArray();
    }
    let rows = local
      .prepare("SELECT body FROM documents WHERE collection=?")
      .all(collection)
      .map((x) => JSON.parse(x.body))
      .filter((x) => matches(x, query));
    if (options.sort)
      rows.sort((a, b) => {
        for (const [key, dir] of Object.entries(options.sort)) {
          if (a[key] > b[key]) return dir;
          if (a[key] < b[key]) return -dir;
        }
        return 0;
      });
    return options.limit ? rows.slice(0, options.limit) : rows;
  },
  async one(collection, query) {
    return (await this.find(collection, query, { limit: 1 }))[0] || null;
  },
  async count(collection, query = {}) {
    return remote
      ? remote.collection(collection).countDocuments(query)
      : (await this.find(collection, query)).length;
  },
  async insert(collection, data) {
    const row = {
      created_at: new Date().toISOString(),
      ...data,
      id: data.id || randomUUID(),
    };
    if (remote)
      await remote.collection(collection).insertOne({ ...row, _id: row.id });
    else
      local
        .prepare("INSERT INTO documents VALUES (?,?,?)")
        .run(collection, row.id, JSON.stringify(row));
    return row;
  },
  async update(collection, query, values) {
    if (remote)
      return remote.collection(collection).updateMany(query, { $set: values });
    const rows = await this.find(collection, query);
    for (const r of rows)
      local
        .prepare("UPDATE documents SET body=? WHERE collection=? AND id=?")
        .run(JSON.stringify({ ...r, ...values }), collection, r.id);
    return { modifiedCount: rows.length };
  },
  async remove(collection, query) {
    if (remote) return remote.collection(collection).deleteMany(query);
    const rows = await this.find(collection, query);
    for (const r of rows)
      local
        .prepare("DELETE FROM documents WHERE collection=? AND id=?")
        .run(collection, r.id);
    return { deletedCount: rows.length };
  },
  async messagesPair(conversationId, userContent, assistantContent) {
    const rows = [
      {
        id: randomUUID(),
        conversation_id: conversationId,
        role: "user",
        content: userContent,
        seq: Date.now() * 1000,
        created_at: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        conversation_id: conversationId,
        role: "assistant",
        content: assistantContent,
        seq: Date.now() * 1000 + 1,
        created_at: new Date().toISOString(),
      },
    ];
    if (remote) {
      const session = mongo.startSession();
      try {
        await session.withTransaction(() =>
          remote.collection("messages").insertMany(
            rows.map((r) => ({ ...r, _id: r.id })),
            { session },
          ),
        );
      } finally {
        await session.endSession();
      }
    } else {
      local.exec("BEGIN");
      try {
        const stmt = local.prepare("INSERT INTO documents VALUES (?,?,?)");
        for (const r of rows) stmt.run("messages", r.id, JSON.stringify(r));
        local.exec("COMMIT");
      } catch (e) {
        local.exec("ROLLBACK");
        throw e;
      }
    }
  },
  async ensureInventory(userId, kind, count) {
    if (remote) {
      try {
        await remote
          .collection("usage")
          .updateOne(
            { user_id: userId, period: "inventory", kind },
            { $setOnInsert: { count } },
            { upsert: true },
          );
      } catch (e) {
        if (e.code !== 11000) throw e;
      }
    } else
      local
        .prepare("INSERT OR IGNORE INTO usage VALUES (?,?,?,?)")
        .run(userId, "inventory", kind, count);
  },
  async reserve(userId, period, kind, n, limit) {
    if (remote) {
      const col = remote.collection("usage");
      try {
        await col.updateOne(
          { user_id: userId, period, kind },
          { $setOnInsert: { count: 0 } },
          { upsert: true },
        );
      } catch (e) {
        if (e.code !== 11000) throw e;
      }
      const r = await col.updateOne(
        { user_id: userId, period, kind, count: { $lte: limit - n } },
        { $inc: { count: n } },
      );
      return r.modifiedCount === 1;
    }
    const r = local
      .prepare(
        "INSERT INTO usage SELECT ?,?,?,? WHERE ?<=? ON CONFLICT(user_id,period,kind) DO UPDATE SET count=count+excluded.count WHERE count+excluded.count<=?",
      )
      .run(userId, period, kind, n, n, limit, limit);
    return !!r.changes;
  },
  async refund(userId, period, kind, n) {
    if (remote)
      await remote
        .collection("usage")
        .updateOne(
          { user_id: userId, period, kind, count: { $gte: n } },
          { $inc: { count: -n } },
        );
    else
      local
        .prepare(
          "UPDATE usage SET count=MAX(0,count-?) WHERE user_id=? AND period=? AND kind=?",
        )
        .run(n, userId, period, kind);
  },
  async usage(userId, period) {
    const rows = remote
      ? await remote
          .collection("usage")
          .find({ user_id: userId, period })
          .toArray()
      : local
          .prepare("SELECT kind,count FROM usage WHERE user_id=? AND period=?")
          .all(userId, period);
    return Object.fromEntries(rows.map((r) => [r.kind, r.count]));
  },
  async close() {
    if (mongo) await mongo.close();
    local?.close();
  },
  engine: mongo ? "mongodb" : "sqlite",
};
