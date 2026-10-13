// Offline, portable SQLite/Mongo backup with private media and integrity verification.
import { DatabaseSync } from "node:sqlite";
import { MongoClient } from "mongodb";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  statSync,
  lstatSync,
  chmodSync,
} from "node:fs";
import { resolve, join, relative } from "node:path";
import { createHash } from "node:crypto";
process.umask(0o077);
try {
  process.loadEnvFile(".env");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const [command, destination, ...flags] = process.argv.slice(2),
  source = resolve(process.env.DATA_DIR || ".data");
if (!["backup", "restore", "verify"].includes(command) || !destination)
  throw Error(
    "Usage: node scripts/backup.js backup|verify|restore /absolute/backup-path [--confirm-restore=BENAI]",
  );
const target = resolve(destination);
if (
  target === source ||
  target.startsWith(source + "/") ||
  source.startsWith(target + "/")
)
  throw Error("Backup directory must be separate from DATA_DIR");
const digest = (b) => createHash("sha256").update(b).digest("hex");
function files(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isSymbolicLink()) throw Error("Backup paths cannot contain symlinks");
    const p = join(dir, e.name);
    return e.isDirectory() ? files(p, base) : [relative(base, p)];
  });
}
function verify() {
  const manifest = JSON.parse(readFileSync(join(target, "manifest.json")));
  if (manifest.version !== 1) throw Error("Unsupported backup format");
  const names = files(target)
    .filter((name) => name !== "manifest.json")
    .sort();
  if (
    !manifest.files["snapshot.json"] ||
    JSON.stringify(names) !== JSON.stringify(Object.keys(manifest.files).sort())
  )
    throw Error("Backup manifest is incomplete");
  for (const [name, sha] of Object.entries(manifest.files)) {
    if (
      name.includes("..") ||
      name.startsWith("/") ||
      !name.match(
        /^(snapshot\.json|\.provider-master-key|uploads\/[a-f0-9-]+\.(png|jpg|webp)|videos\/[a-f0-9-]+\.mp4)$/,
      )
    )
      throw Error("Unsafe backup path");
    const p = join(target, name);
    if (lstatSync(p).isSymbolicLink() || digest(readFileSync(p)) !== sha)
      throw Error("Backup integrity check failed: " + name);
  }
  return JSON.parse(readFileSync(join(target, "snapshot.json")));
}
if (command === "verify") {
  const snapshot = verify();
  console.log("Backup verified:", snapshot.documents.length, "documents");
  process.exit(0);
}
try {
  const r = await fetch(
    (process.env.APP_URL || "http://127.0.0.1:3001") + "/api/health",
    { signal: AbortSignal.timeout(1000) },
  );
  if (r.ok) throw Error("APP_IS_RUNNING");
} catch (e) {
  if (e.message === "APP_IS_RUNNING")
    throw Error(
      "Stop the BENAI application before backup/restore to obtain a consistent snapshot",
    );
}
let mongo, db, sql;
if (process.env.MONGODB_URI) {
  mongo = new MongoClient(process.env.MONGODB_URI);
  await mongo.connect();
  db = mongo.db(process.env.MONGODB_DB || "benai");
} else {
  mkdirSync(source, { recursive: true });
  sql = new DatabaseSync(join(source, "benai.sqlite"));
}
try {
  if (command === "backup") {
    if (existsSync(target) && readdirSync(target).length)
      throw Error("Backup destination must be empty");
    mkdirSync(target, { recursive: true, mode: 0o700 });
    chmodSync(target, 0o700);
    let documents = [],
      usage = [];
    if (db) {
      const session = mongo.startSession();
      try {
        await session.withTransaction(
          async () => {
            documents = [];
            for (const { name } of await db.listCollections().toArray()) {
              if (name === "usage") {
                usage = await db
                  .collection(name)
                  .find({}, { session, projection: { _id: 0 } })
                  .toArray();
                continue;
              }
              for (const row of await db
                .collection(name)
                .find({}, { session, projection: { _id: 0 } })
                .toArray())
                documents.push({
                  collection: name,
                  id: row.id,
                  body: JSON.stringify(row),
                });
            }
          },
          { readConcern: { level: "snapshot" } },
        );
      } finally {
        await session.endSession();
      }
    } else {
      sql.exec("BEGIN");
      try {
        documents = sql.prepare("SELECT * FROM documents").all();
        usage = sql.prepare("SELECT * FROM usage").all();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    }
    writeFileSync(
      join(target, "snapshot.json"),
      JSON.stringify({ version: 1, documents, usage }),
    );
    for (const folder of ["uploads", "videos"])
      if (existsSync(join(source, folder)))
        for (const name of files(join(source, folder))) {
          const output = join(target, folder, name);
          mkdirSync(resolve(output, ".."), { recursive: true });
          copyFileSync(join(source, folder, name), output);
        }
    if (existsSync(join(source, ".provider-master-key")))
      copyFileSync(
        join(source, ".provider-master-key"),
        join(target, ".provider-master-key"),
      );
    const hashes = {};
    for (const name of files(target))
      hashes[name] = digest(readFileSync(join(target, name)));
    writeFileSync(
      join(target, "manifest.json"),
      JSON.stringify(
        { version: 1, created_at: new Date().toISOString(), files: hashes },
        null,
        2,
      ),
    );
    verify();
    console.log("Backup created and verified:", target);
  } else {
    if (!flags.includes("--confirm-restore=BENAI"))
      throw Error("Restore requires --confirm-restore=BENAI");
    const snapshot = verify();
    for (const name of Object.keys(
      JSON.parse(readFileSync(join(target, "manifest.json"))).files,
    ))
      if (name !== "snapshot.json" && existsSync(join(source, name)))
        throw Error("Restore media destination must be empty: " + name);
    if (db) {
      if ((await db.listCollections().toArray()).length)
        throw Error("Restore requires an empty MongoDB database");
      const groups = new Map();
      for (const d of snapshot.documents) {
        const row = JSON.parse(d.body);
        if (!groups.has(d.collection)) groups.set(d.collection, []);
        groups.get(d.collection).push({ ...row, _id: row.id });
      }
      for (const [name, rows] of groups)
        if (rows.length) await db.collection(name).insertMany(rows);
      if (snapshot.usage.length)
        await db.collection("usage").insertMany(snapshot.usage);
    } else {
      sql.exec(
        "CREATE TABLE IF NOT EXISTS documents(collection TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(collection,id));CREATE TABLE IF NOT EXISTS usage(user_id TEXT,period TEXT,kind TEXT,count INTEGER NOT NULL,PRIMARY KEY(user_id,period,kind));",
      );
      if (sql.prepare("SELECT count(*) n FROM documents").get().n)
        throw Error("Restore requires an empty SQLite database");
      sql.exec("BEGIN");
      try {
        const insert = sql.prepare("INSERT INTO documents VALUES(?,?,?)");
        for (const d of snapshot.documents)
          insert.run(d.collection, d.id, d.body);
        const put = sql.prepare("INSERT INTO usage VALUES(?,?,?,?)");
        for (const u of snapshot.usage)
          put.run(u.user_id, u.period, u.kind, u.count);
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    }
    for (const name of Object.keys(
      JSON.parse(readFileSync(join(target, "manifest.json"))).files,
    ))
      if (name !== "snapshot.json") {
        const output = join(source, name);
        if (existsSync(output))
          throw Error("Restore media destination must be empty: " + name);
        mkdirSync(resolve(output, ".."), { recursive: true });
        copyFileSync(join(target, name), output);
        chmodSync(output, 0o600);
      }
    console.log(
      "Backup restored into empty database/media directory. Supply the original BYOK_MASTER_KEY if it was configured externally.",
    );
  }
} finally {
  sql?.close();
  await mongo?.close();
}
