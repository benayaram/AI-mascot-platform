import { randomUUID } from "node:crypto";
import multer from "multer";
import { store } from "./storage.js";
import { reserveInventory } from "./db.js";
export const words = (text) =>
  text.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
export function chunks(text) {
  const out = [];
  for (let n = 0; n < text.length; n += 900) out.push(text.slice(n, n + 1100));
  return out.slice(0, 120);
}
export async function retrieve(userId, query) {
  if (!userId) return [];
  const terms = [...new Set(words(query))];
  const docs = await store.find(
    "knowledge",
    { user_id: userId },
    { limit: 30 },
  );
  return docs
    .flatMap((doc) =>
      chunks(doc.text).map((text, index) => ({
        id: doc.id,
        name: doc.name,
        index,
        text,
        score: terms.reduce(
          (n, w) => n + (text.toLocaleLowerCase().includes(w) ? 1 : 0),
          0,
        ),
      })),
    )
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
export function installKnowledgeRoutes({ app, auth, parse, z, fail }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  });
  const paths = ["/api/knowledge", "/api/v1/knowledge"];
  app.get(paths, auth, async (req, res) =>
    res.json({
      documents: (await store.find("knowledge", { user_id: req.user.id })).map(
        ({ text, ...doc }) => ({ ...doc, characters: text.length }),
      ),
    }),
  );
  app.post(paths, auth, upload.single("file"), async (req, res) => {
    const count = (await store.find("knowledge", { user_id: req.user.id }))
      .length;
    if (count >= 30)
      fail(409, "Remove a document before adding another (30 document limit)");
    let name, text;
    if (req.file) {
      name = req.file.originalname.slice(0, 100);
      if (req.file.buffer.subarray(0, 5).toString() === "%PDF-") {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) });
        try {
          text = (await parser.getText()).text;
        } finally {
          await parser.destroy();
        }
      } else if (/\.(txt|md)$/i.test(name))
        text = req.file.buffer.toString("utf8");
      else fail(400, "Upload a text, Markdown or text-based PDF file");
    } else
      ({ name, text } = parse(
        z.object({
          name: z.string().trim().min(1).max(100),
          text: z.string().trim().min(10).max(100000),
        }),
        req.body,
      ));
    text = text?.replace(/\u0000/g, "").trim();
    if (!text || text.length < 10 || text.length > 100000)
      fail(
        400,
        "Document must contain 10–100,000 readable characters. Scanned PDFs need OCR first.",
      );
    const doc = {
      id: randomUUID(),
      user_id: req.user.id,
      name,
      text,
      created_at: new Date().toISOString(),
    };
    const release = await reserveInventory(req.user, "knowledge", 30, count);
    try {
      await store.insert("knowledge", doc);
    } catch (e) {
      await release();
      throw e;
    }
    res.status(201).json({ id: doc.id, name, characters: text.length });
  });
  app.delete(
    ["/api/knowledge/:id", "/api/v1/knowledge/:id"],
    auth,
    async (req, res) => {
      const removed = await store.consumeOne("knowledge", {
        id: req.params.id,
        user_id: req.user.id,
      });
      if (removed) await store.refund(req.user.id, "inventory", "knowledge", 1);
      res.json({ ok: true });
    },
  );
}
