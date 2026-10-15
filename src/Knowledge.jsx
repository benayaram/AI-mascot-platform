import { useContext, useEffect, useState } from "react";
import { api } from "./api";
import { Toast } from "./contexts";
export default function Knowledge() {
  const toast = useContext(Toast),
    [docs, setDocs] = useState([]),
    [name, setName] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => setDocs((await api("/knowledge")).documents);
  const act = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    act(async () => {});
  }, []);
  return (
    <>
      <div className="page-header">
        <div>
          <span className="eyebrow">TEACH YOUR ASSISTANT</span>
          <h1>Knowledge sources</h1>
          <p>
            Private documents help your avatars answer from your own material.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <form
          className="panel stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              await api("/knowledge", { method: "POST", body: { name, text } });
              setName("");
              setText("");
              toast("Source added");
            });
          }}
        >
          <h2>Add a reference</h2>
          <label>
            Source name
            <input
              required
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Facts and reference text
            <textarea
              required
              minLength={10}
              maxLength={100000}
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <button className="button" disabled={busy}>
            Save source
          </button>
          <label>
            Or upload PDF, TXT or Markdown (4 MB)
            <input
              type="file"
              accept=".pdf,.txt,.md"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files[0];
                if (f)
                  act(async () => {
                    const body = new FormData();
                    body.append("file", f);
                    await api("/knowledge", { method: "POST", body });
                    toast("Source uploaded");
                  });
                e.target.value = "";
              }}
            />
          </label>
          <p className="muted">
            CPU-friendly keyword retrieval. PDFs need selectable text. Enable
            “Only answer from my sources” in AI & compute for a restricted
            assistant. Models can still make mistakes; verify important answers.
          </p>
        </form>
        <div className="panel stack-form">
          <h2>Your sources</h2>
          {!docs.length && <p>No sources yet.</p>}
          {docs.map((d) => (
            <div className="section-heading" key={d.id}>
              <div>
                <strong>{d.name}</strong>
                <p>{d.characters.toLocaleString()} characters</p>
              </div>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  act(() => api("/knowledge/" + d.id, { method: "DELETE" }))
                }
              >
                Delete source
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
