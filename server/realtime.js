import { WebSocketServer, WebSocket } from "ws";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { repo } from "./repository.js";
import { store, reserve, userUsage } from "./db.js";
import { streamReply, providerFetch, unavailable } from "./providers.js";
import { speech } from "./media.js";
import { settings } from "./customer-providers.js";
const turns = z
  .object({
    type: z.literal("turn"),
    csrf: z.string(),
    avatar_id: z.string(),
    conversation_id: z.string().optional(),
    speak: z.boolean().default(true),
    text: z.string().trim().min(1).max(5000).optional(),
    audio: z
      .string()
      .max(7 * 1024 * 1024)
      .optional(),
  })
  .refine((v) => !!v.text !== !!v.audio, "Send either text or audio");
const hash = (v) => createHash("sha256").update(v).digest("hex");
export function attachRealtime(server) {
  const wss = new WebSocketServer({
      noServer: true,
      maxPayload: 8 * 1024 * 1024,
    }),
    connections = new Map();
  server.on("upgrade", async (request, socket, head) => {
    try {
      if (
        new URL(request.url, "http://localhost").pathname !== "/api/realtime"
      ) {
        socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
        return;
      }
      const allowed = [
        new URL(process.env.APP_URL || "http://localhost:3001").origin,
      ];
      if (process.env.NODE_ENV !== "production")
        allowed.push("http://localhost:5173", "http://127.0.0.1:5173");
      if (!allowed.includes(request.headers.origin)) {
        socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
        return;
      }
      const cookie = request.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("persona_session="))
        ?.slice(16);
      const session = cookie
        ? await repo.session(hash(cookie), Date.now())
        : null;
      if (!session) {
        socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
        return;
      }
      if (connections.has(session.user_id)) {
        socket.end("HTTP/1.1 429 Too Many Requests\r\n\r\n");
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        connections.set(session.user_id, ws);
        wss.emit("connection", ws, session);
      });
    } catch {
      socket.destroy();
    }
  });
  wss.on("connection", (ws, session) => {
    let controller = null,
      busy = false,
      lastTurn = 0,
      heartbeat = true;
    const send = (data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
    };
    send({
      type: "ready",
      protocol: 2,
      transport: "self-hosted",
      max_recording_seconds: 25,
    });
    ws.on("pong", () => {
      heartbeat = true;
    });
    const timer = setInterval(() => {
      if (!heartbeat) {
        ws.terminate();
        return;
      }
      heartbeat = false;
      ws.ping();
    }, 30000);
    timer.unref();
    ws.on("close", () => {
      controller?.abort();
      clearInterval(timer);
      connections.delete(session.user_id);
    });
    ws.on("error", () => controller?.abort());
    ws.on("message", async (raw) => {
      let payload;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        send({ type: "error", error: "Invalid realtime message" });
        return;
      }
      if (payload.type === "interrupt") {
        controller?.abort();
        send({ type: "interrupted" });
        return;
      }
      if (busy) {
        send({ type: "error", error: "A voice turn is already running" });
        return;
      }
      const parsed = turns.safeParse(payload);
      if (!parsed.success) {
        send({ type: "error", error: "Invalid voice turn" });
        return;
      }
      const v = parsed.data;
      if (v.csrf !== session.csrf) {
        ws.close(1008, "Invalid CSRF token");
        return;
      }
      if (Date.now() - lastTurn < 1000) {
        send({ type: "error", error: "Wait before starting the next turn" });
        return;
      }
      lastTurn = Date.now();
      busy = true;
      controller = new AbortController();
      const signal = controller.signal;
      let refundMessage, refundVoice;
      const started = performance.now(),
        timing = {};
      try {
        if (!(await repo.session(session.token, Date.now()))) {
          ws.close(1008, "Session expired");
          return;
        }
        const user = await repo.user(session.user_id),
          avatar = await repo.avatar(v.avatar_id);
        if (
          !avatar ||
          !(
            avatar.public ||
            avatar.owner_id === user.id ||
            user.role === "admin"
          )
        )
          throw Error("Avatar not found");
        let conversation = v.conversation_id
          ? await repo.avatarConversationFor(
              v.conversation_id,
              user.id,
              avatar.id,
            )
          : null;
        if (v.conversation_id && !conversation)
          throw Error("Conversation not found");
        if (
          (process.env.NODE_ENV === "production" ||
            process.env.REQUIRE_VERIFIED_EMAIL === "true") &&
          user.role !== "admin" &&
          !user.email_verified
        )
          throw Object.assign(
            Error("Verify your email before using live conversation"),
            { status: 403 },
          );
        const prefs = await settings(user.id);
        if (
          !process.env.LOCAL_AI_URL ||
          (v.audio && !process.env.LOCAL_SPEECH_URL) ||
          (!process.env.LOCAL_SPEECH_URL && prefs.tts === "local")
        )
          throw unavailable("Realtime models");
        refundMessage = await reserve(user, "messages");
        refundVoice = await reserve(
          user,
          "voice",
          (v.audio ? 1 : 0) + (v.speak ? 1 : 0),
        );
        let text = v.text;
        if (v.audio) {
          send({ type: "state", state: "transcribing" });
          const bytes = Buffer.from(v.audio, "base64");
          if (bytes.length > 5 * 1024 * 1024)
            throw Error("Recording too large");
          const r = await providerFetch(
            process.env.LOCAL_SPEECH_URL + "/transcribe",
            {
              method: "POST",
              signal,
              headers: { "Content-Type": "audio/webm" },
              body: bytes,
            },
          );
          text = (await r.json()).text?.trim();
          timing.transcription_ms = Math.round(performance.now() - started);
          if (!text)
            throw Error("No speech detected. Speak clearly and try again.");
        }
        send({ type: "transcript", text });
        send({ type: "state", state: "thinking" });
        const history = conversation
          ? (await repo.history(conversation.id)).reverse()
          : [];
        let first = true;
        const content = await streamReply(
          avatar,
          [...history, { role: "user", content: text }],
          {
            signal,
            onToken: (token) => {
              if (first) {
                first = false;
                timing.first_token_ms = Math.round(performance.now() - started);
              }
              send({ type: "token", token });
            },
          },
        );
        if (signal.aborted) throw new DOMException("Interrupted", "AbortError");
        if (!conversation) {
          conversation = { id: randomUUID() };
          await repo.createConversation(
            conversation.id,
            user.id,
            avatar.id,
            text.slice(0, 80),
          );
        }
        await store.messagesPair(conversation.id, text, content);
        refundMessage = null;
        send({ type: "reply", content, conversation_id: conversation.id });
        if (!v.speak) {
          refundVoice = null;
          send({ type: "done", usage: await userUsage(user.id), timing });
          return;
        }
        send({ type: "state", state: "synthesizing" });
        let streamedAudio = false;
        const audio = await speech(content, avatar.voice, {
          signal,
          userId: user.id,
          onAudio: (chunk) => {
            if (signal.aborted) return;
            if (!streamedAudio)
              timing.audio_first_chunk_ms = Math.round(
                performance.now() - started,
              );
            streamedAudio = true;
            refundVoice = null;
            send({
              type: "audio",
              audio: chunk.toString("base64"),
              mime: "audio/wav",
              streamed: true,
            });
          },
        });
        if (signal.aborted) throw new DOMException("Interrupted", "AbortError");
        timing.audio_ready_ms = Math.round(performance.now() - started);
        refundVoice = null;
        if (!streamedAudio)
          send({
            type: "audio",
            audio: audio.toString("base64"),
            mime: "audio/wav",
          });
        send({ type: "done", usage: await userUsage(user.id), timing });
      } catch (e) {
        if (refundMessage) await refundMessage();
        if (refundVoice) await refundVoice();
        send(
          signal.aborted
            ? { type: "interrupted" }
            : {
                type: "error",
                error: e.status
                  ? e.message
                  : e.name === "AbortError"
                    ? "The model request timed out"
                    : e.message,
              },
        );
      } finally {
        busy = false;
        controller = null;
        send({ type: "state", state: "ready" });
      }
    });
  });
  return wss;
}
