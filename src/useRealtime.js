import { useEffect, useRef } from "react";
import { getCsrf } from "./api";
export function useRealtime(callbacks) {
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const connection = useRef(null),
    pending = useRef(null),
    connecting = useRef(null);
  function interrupt() {
    if (connection.current?.readyState === WebSocket.OPEN)
      connection.current.send(JSON.stringify({ type: "interrupt" }));
    latest.current.onInterrupt?.();
  }
  async function connect() {
    if (connection.current?.readyState === WebSocket.OPEN)
      return connection.current;
    if (connecting.current) return connecting.current;
    connecting.current = new Promise((resolve, reject) => {
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/realtime`,
      );
      connection.current = ws;
      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "ready") {
          connecting.current = null;
          resolve(ws);
          return;
        }
        try {
          latest.current.onEvent?.(data);
        } catch (e) {
          latest.current.onError?.(e.message);
        }
        if (data.type === "done") {
          pending.current?.resolve(data);
          pending.current = null;
        }
        if (data.type === "error" || data.type === "interrupted") {
          pending.current?.reject(
            new Error(data.error || "Conversation interrupted"),
          );
          pending.current = null;
        }
      };
      ws.onerror = () => {
        connecting.current = null;
        reject(
          new Error(
            "Cannot connect to the self-hosted voice channel. Check the application and model services.",
          ),
        );
      };
      ws.onclose = () => {
        connecting.current = null;
        connection.current = null;
        pending.current?.reject(new Error("Voice connection closed"));
        pending.current = null;
      };
    });
    return connecting.current;
  }
  async function turn(values) {
    if (pending.current) throw Error("A voice turn is already running");
    const ws = await connect();
    return new Promise((resolve, reject) => {
      pending.current = { resolve, reject };
      ws.send(JSON.stringify({ type: "turn", csrf: getCsrf(), ...values }));
    });
  }
  async function audio(blob, values) {
    const buffer = new Uint8Array(await blob.arrayBuffer());
    let text = "";
    for (let i = 0; i < buffer.length; i += 8192)
      text += String.fromCharCode(...buffer.subarray(i, i + 8192));
    return turn({ ...values, audio: btoa(text) });
  }
  useEffect(
    () => () => {
      connection.current?.close();
      pending.current?.reject(new Error("Studio closed"));
      pending.current = null;
    },
    [],
  );
  return { turn, audio, interrupt };
}
