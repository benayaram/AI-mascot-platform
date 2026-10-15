import React, { useEffect, useState, useContext } from "react";
import { Player } from "@remotion/player";
import { Lesson, lessonFrames, sampleLesson } from "../lecture/Lesson";
import { api } from "./api";
import { Toast } from "./contexts";
export default function Institute() {
  const toast = useContext(Toast),
    [lessons, setLessons] = useState([]),
    [avatars, setAvatars] = useState([]),
    [assets, setAssets] = useState([]),
    [id, setId] = useState(""),
    [draft, setDraft] = useState({
      ...sampleLesson,
      avatar_id: "elena",
      animate_avatar: true,
      quality: "fast",
    }),
    [topic, setTopic] = useState(""),
    [busy, setBusy] = useState(false),
    [current, setCurrent] = useState(null);
  const perform = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  async function load() {
    const [a, b, c] = await Promise.all([
      api("/lessons"),
      api("/avatars"),
      api("/lesson-assets"),
    ]);
    setLessons(a.lessons);
    setAvatars(b.avatars);
    setAssets(c.assets);
  }
  useEffect(() => {
    perform(load);
  }, []);
  useEffect(() => {
    if (current?.status !== "processing") return;
    const timer = setInterval(async () => {
      try {
        const d = await api("/lessons/" + current.id);
        setCurrent(d.lesson);
        if (d.lesson.status !== "processing") {
          load();
          toast(
            d.lesson.status === "completed"
              ? "Lesson export ready"
              : d.lesson.error,
            d.lesson.status === "failed" ? "error" : undefined,
          );
        }
      } catch (e) {
        toast(e.message, "error");
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [current?.id, current?.status]);
  function setScene(i, key, value) {
    setDraft((d) => ({
      ...d,
      scenes: d.scenes.map((s, n) => (n === i ? { ...s, [key]: value } : s)),
    }));
  }
  async function save() {
    const d = await api("/lessons" + (id ? "/" + id : ""), {
      method: id ? "PUT" : "POST",
      body: draft,
    });
    setId(d.lesson.id);
    setCurrent(d.lesson);
    await load();
    return d.lesson;
  }
  const avatar = avatars.find((a) => a.id === draft.avatar_id);
  const preview = {
    ...draft,
    avatarImage: avatar?.image,
    scenes: draft.scenes.map((s, i) => ({
      ...s,
      duration:
        current?.scene_durations?.[i] ||
        Math.max(5, s.narration.split(/\s+/).length / 2.3),
      media: s.media_id
        ? {
            kind: assets.find((a) => a.id === s.media_id)?.kind,
            src: "/api/lesson-assets/" + s.media_id,
          }
        : undefined,
    })),
  };
  return (
    <>
      <div className="page-header">
        <div>
          <span className="eyebrow">BENAI INSTITUTE</span>
          <h1>Teach with a story.</h1>
          <p>
            Combine an AI narrator, motion graphics, and your own teaching
            media.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            setId("");
            setCurrent(null);
            setDraft({
              ...sampleLesson,
              avatar_id: "elena",
              animate_avatar: true,
              quality: "fast",
            });
          }}
        >
          New lesson
        </button>
      </div>
      <div className="institute-grid">
        <section className="stack-form">
          <div className="panel stack-form">
            <label>
              Lesson library
              <select
                aria-label="Lesson library"
                value={id}
                onChange={(e) => {
                  const l = lessons.find((x) => x.id === e.target.value);
                  if (l) {
                    setId(l.id);
                    setDraft(l);
                    setCurrent(l);
                  }
                }}
              >
                <option value="">New unsaved lesson</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title} · {l.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Topic for AI outline
              <input
                placeholder="Explain photosynthesis for class 7"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </label>
            <button
              className="button secondary"
              disabled={busy || topic.length < 3}
              onClick={() =>
                perform(async () => {
                  const r = await api("/lessons/generate", {
                    method: "POST",
                    body: { topic, avatar_id: draft.avatar_id },
                  });
                  setDraft(r.draft);
                  setId("");
                  setCurrent(null);
                  toast(
                    "AI outline ready. Review facts and edit scenes before exporting.",
                  );
                })
              }
            >
              Generate AI outline
            </button>
            <label>
              Lesson title
              <input
                value={draft.title}
                maxLength={100}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <div className="form-grid">
              <label>
                Explaining avatar
                <select
                  value={draft.avatar_id}
                  onChange={(e) =>
                    setDraft({ ...draft, avatar_id: e.target.value })
                  }
                >
                  {avatars.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Avatar quality
                <select
                  value={draft.quality}
                  onChange={(e) =>
                    setDraft({ ...draft, quality: e.target.value })
                  }
                >
                  <option value="fast">Fast portrait animation</option>
                  <option value="neural">Neural lip sync · slow CPU</option>
                </select>
              </label>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={draft.animate_avatar}
                onChange={(e) =>
                  setDraft({ ...draft, animate_avatar: e.target.checked })
                }
              />
              Animate realistic avatar during export
            </label>
            <p className="muted">
              Preview shows layout with estimated timing. Export adds your
              selected speech provider and generated avatar footage. Fast
              portraits use audio-driven warping; neural lips have a 6-second
              scene limit on CPU. Uploaded supporting clips are muted.
            </p>
          </div>
          {draft.scenes.map((s, i) => (
            <div className="panel stack-form" key={i}>
              <div className="section-heading">
                <h2>Scene {i + 1}</h2>
                <button
                  className="button secondary"
                  disabled={draft.scenes.length === 1}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      scenes: draft.scenes.filter((_, n) => n !== i),
                    })
                  }
                >
                  Remove scene
                </button>
              </div>
              <label>
                Scene heading
                <input
                  value={s.title}
                  maxLength={90}
                  onChange={(e) => setScene(i, "title", e.target.value)}
                />
              </label>
              <label>
                Spoken explanation
                <textarea
                  value={s.narration}
                  maxLength={1200}
                  rows={4}
                  onChange={(e) => setScene(i, "narration", e.target.value)}
                />
              </label>
              <label>
                Visual points (one per line, up to four)
                <textarea
                  value={s.points.join("\n")}
                  rows={4}
                  onChange={(e) =>
                    setScene(
                      i,
                      "points",
                      e.target.value.split("\n").slice(0, 4),
                    )
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  Visual layout
                  <select
                    value={s.visual || "steps"}
                    onChange={(e) => setScene(i, "visual", e.target.value)}
                  >
                    <option value="steps">Animated steps</option>
                    <option value="cycle">Cycle cards</option>
                  </select>
                </label>
                <label>
                  Supporting image or video
                  <select
                    value={s.media_id || ""}
                    onChange={(e) =>
                      setScene(i, "media_id", e.target.value || null)
                    }
                  >
                    <option value="">Use motion graphics</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
          <button
            className="button secondary"
            disabled={draft.scenes.length >= 6}
            onClick={() =>
              setDraft({
                ...draft,
                scenes: [
                  ...draft.scenes,
                  {
                    title: "Check your understanding",
                    narration:
                      "Pause and explain this idea using your own example.",
                    points: ["Explain the idea", "Give a real example"],
                    visual: "steps",
                  },
                ],
              })
            }
          >
            Add scene
          </button>
          <div className="panel stack-form">
            <label>
              Upload teaching media (20 MB; video up to 60 seconds)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file)
                    perform(async () => {
                      const body = new FormData();
                      body.append("file", file);
                      await api("/lesson-assets", { method: "POST", body });
                      await load();
                      toast("Teaching media uploaded");
                    });
                  e.target.value = "";
                }}
              />
            </label>
            {assets.map((a) => (
              <div className="section-heading" key={a.id}>
                <span>
                  {a.name} · {a.kind}
                </span>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await api("/lesson-assets/" + a.id, { method: "DELETE" });
                      await load();
                    })
                  }
                >
                  Delete file
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="institute-preview">
          <div className="panel stack-form">
            <h2>Lesson preview</h2>
            <Player
              key={
                id +
                JSON.stringify(
                  preview.scenes.map((s) => [s.duration, s.media_id]),
                )
              }
              component={Lesson}
              inputProps={preview}
              compositionWidth={1280}
              compositionHeight={720}
              durationInFrames={lessonFrames(preview.scenes)}
              fps={24}
              controls
              style={{ width: "100%", borderRadius: 16, overflow: "hidden" }}
            />
            <div className="action-row">
              <button
                className="button secondary"
                disabled={busy || current?.status === "processing"}
                onClick={() =>
                  perform(async () => {
                    await save();
                    toast("Lesson saved");
                  })
                }
              >
                Save lesson
              </button>
              <button
                className="button"
                disabled={busy || current?.status === "processing"}
                onClick={() =>
                  perform(async () => {
                    const l = await save();
                    await api("/lessons/" + l.id + "/render", {
                      method: "POST",
                    });
                    setCurrent({ ...l, status: "processing", progress: 0 });
                    toast("Export started. You may leave this page.");
                  })
                }
              >
                Export narrated MP4
              </button>
            </div>
            {current?.status === "processing" && (
              <p role="status">Exporting lesson… {current.progress || 0}%</p>
            )}
            {current?.status === "failed" && (
              <p role="alert">
                {current.error} Reserved quotas refunded. Edit and retry.
              </p>
            )}
            {current?.status === "completed" && (
              <>
                <p>
                  {Math.round(current.duration)} seconds ·{" "}
                  {(current.render_ms / 1000).toFixed(1)} seconds to render
                </p>
                <video
                  key={current.render_ms}
                  controls
                  src={"/api/lessons/" + current.id + "/download"}
                  style={{ width: "100%", borderRadius: 14 }}
                />
                <div className="action-row">
                  <a
                    className="button"
                    href={"/api/lessons/" + current.id + "/download"}
                    download
                  >
                    Download MP4
                  </a>
                  <a
                    className="button secondary"
                    href={"/api/lessons/" + current.id + "/captions"}
                    download="captions.vtt"
                  >
                    Download captions
                  </a>
                </div>
              </>
            )}
            {id && (
              <button
                className="button secondary"
                disabled={busy || current?.status === "processing"}
                onClick={() =>
                  perform(async () => {
                    await api("/lessons/" + id, { method: "DELETE" });
                    setId("");
                    setCurrent(null);
                    await load();
                    toast("Lesson deleted");
                  })
                }
              >
                Delete lesson
              </button>
            )}
          </div>
          <div className="panel">
            <h3>Connect your institute</h3>
            <p>
              Your API supports creating lessons, uploading media, exporting,
              and downloading. Use <code>/api/v1/lessons</code> with a customer
              API key on an eligible plan.
            </p>
            <p className="muted">
              Review generated educational content before sharing. Captions are
              sentence/scene timed, not word-aligned. Use AI & compute to select
              Telugu or another language.
            </p>
          </div>
          {id && <LessonTutor id={id} />}
        </section>
      </div>
    </>
  );
}

function LessonTutor({ id }) {
  const toast = useContext(Toast),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState(""),
    [busy, setBusy] = useState(false),
    [audio, setAudio] = useState("");
  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio);
    },
    [audio],
  );
  useEffect(() => {
    setAnswer("");
    setQuestion("");
    setAudio("");
  }, [id]);
  return (
    <form
      className="panel stack-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await api("/lessons/" + id + "/ask", {
            method: "POST",
            body: { question },
          });
          setAnswer(r.content);
          setAudio("");
        } catch (e) {
          toast(e.message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Ask about this lesson</h2>
      <label>
        Your question
        <input
          value={question}
          maxLength={2000}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Why does water form clouds?"
          required
          minLength={2}
        />
      </label>
      <button className="button secondary" disabled={busy}>
        {busy ? "Thinking…" : "Explain this doubt"}
      </button>
      {answer && (
        <>
          <p style={{ whiteSpace: "pre-wrap" }}>{answer}</p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const blob = await api("/tts", {
                  method: "POST",
                  body: { text: answer.slice(0, 4000) },
                  binary: true,
                });
                setAudio(URL.createObjectURL(blob));
              } catch (e) {
                toast(e.message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Generate spoken explanation
          </button>
          {audio && <audio src={audio} controls autoPlay />}
        </>
      )}
      <p className="muted">
        Uses your selected answer and voice providers with your plan limits.
        Answers are based on this lesson and your reference sources; review
        important facts.
      </p>
    </form>
  );
}
