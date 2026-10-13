import { useEffect, useRef, useState } from "react";
import { api } from "./api";
export function useLiveVoice({
  onTranscript,
  onAudio,
  onError,
  busy,
  speaking,
}) {
  const latest = useRef();
  latest.current = { onTranscript, onAudio, onError, busy, speaking };
  const engine = useRef(null),
    [active, setActive] = useState(false),
    [listening, setListening] = useState(false);
  function stop() {
    const e = engine.current;
    if (!e) return;
    e.active = false;
    cancelAnimationFrame(e.animation);
    if (e.recorder?.state === "recording") e.recorder.stop();
    e.stream?.getTracks().forEach((t) => t.stop());
    e.context?.close().catch(() => {});
    engine.current = null;
    setActive(false);
    setListening(false);
  }
  async function start() {
    if (engine.current) {
      stop();
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Live voice requires HTTPS and a supported browser.");
      const e = { active: true, processing: false, lastSpeech: 0, started: 0 };
      engine.current = e;
      e.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!e.active) {
        e.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      e.context = new AudioContext();
      await e.context.resume();
      const source = e.context.createMediaStreamSource(e.stream),
        analyser = e.context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      // Keep the capture graph processing without monitoring the microphone.
      const mute = e.context.createGain();
      mute.gain.value = 0;
      analyser.connect(mute);
      mute.connect(e.context.destination);
      const values = new Float32Array(2048);
      setActive(true);
      function begin() {
        e.chunks = [];
        e.recorder = new MediaRecorder(e.stream);
        e.recorder.ondataavailable = (event) => {
          if (event.data.size) e.chunks.push(event.data);
        };
        e.recorder.onstop = async () => {
          if (!e.active) return;
          e.processing = true;
          setListening(false);
          const form = new FormData();
          form.append(
            "audio",
            new Blob(e.chunks, { type: e.recorder.mimeType }),
            "voice.webm",
          );
          try {
            if (latest.current.onAudio) {
              await latest.current.onAudio(
                new Blob(e.chunks, { type: e.recorder.mimeType }),
              );
              return;
            }
            const result = await api("/transcribe", {
              method: "POST",
              body: form,
            });
            if (e.active && result.text.trim())
              await latest.current.onTranscript(result.text);
          } catch (error) {
            if (e.active) latest.current.onError(error.message);
          } finally {
            e.processing = false;
          }
        };
        e.recorder.start();
        e.started = performance.now();
        setListening(true);
      }
      function tick() {
        if (!e.active) return;
        const now = performance.now();
        analyser.getFloatTimeDomainData(values);
        const level = Math.sqrt(
          values.reduce((n, v) => n + v * v, 0) / values.length,
        );
        const available =
          !latest.current.busy && !latest.current.speaking && !e.processing;
        if (available && level > 0.035) {
          e.lastSpeech = now;
          if (e.recorder?.state !== "recording") begin();
        }
        if (
          e.recorder?.state === "recording" &&
          (now - e.lastSpeech > 850 || now - e.started > 25000 || !available)
        ) {
          e.processing = true;
          e.recorder.stop();
        }
        e.animation = requestAnimationFrame(tick);
      }
      tick();
    } catch (error) {
      stop();
      latest.current.onError(
        error.name === "NotAllowedError"
          ? "Microphone access was denied. Enable it to start live voice."
          : error.message,
      );
    }
  }
  useEffect(() => () => stop(), []);
  return { active, listening, toggle: start, stop };
}
