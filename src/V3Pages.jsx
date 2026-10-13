import { useState, useEffect, useContext, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "./api";
import { Auth, Toast } from "./contexts";
import PortraitAvatar from "./PortraitAvatar";
function Heading({ title, children }) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">BENAI WORKSPACE</span>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
    </div>
  );
}
function useLoad(path) {
  const toast = useContext(Toast),
    [data, setData] = useState(null);
  async function load() {
    try {
      setData(await api(path));
    } catch (e) {
      toast(e.message, "error");
    }
  }
  useEffect(() => {
    load();
  }, [path]);
  return [data, load];
}
export function AISettings() {
  const { refresh } = useContext(Auth);
  const [data, load] = useLoad("/provider-settings"),
    toast = useContext(Toast),
    [prefs, setPrefs] = useState(null),
    [busy, setBusy] = useState(""),
    [discoveries, setDiscoveries] = useState({}),
    [preview, setPreview] = useState(null);
  useEffect(() => {
    if (data) setPrefs(data.settings);
  }, [data]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function action(name, fn) {
    setBusy(name);
    try {
      await fn();
      await load();
      await refresh();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  }
  if (!data || !prefs) return <p role="status">Loading provider settings…</p>;
  const set = (key, value) => setPrefs((p) => ({ ...p, [key]: value }));
  return (
    <>
      <Heading title="AI providers & compute">
        Keep local inference, or use your own provider account. External usage
        is billed by that provider.
      </Heading>
      <form
        className="panel stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          action("settings", async () => {
            await api("/provider-settings", {
              method: "PUT",
              body: {
                tts: prefs.tts,
                video: prefs.video,
                compute: prefs.compute,
                quality: prefs.quality,
              },
            });
            toast("Provider choices saved");
          });
        }}
      >
        <div className="settings-grid">
          <label>
            Speech provider
            <select
              value={prefs.tts}
              onChange={(e) => set("tts", e.target.value)}
            >
              <option value="local">Local Piper · no provider bill</option>
              {Object.entries(data.catalog)
                .filter(([, p]) => p.kind === "tts")
                .map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.name} · your API key
                  </option>
                ))}
            </select>
          </label>
          <label>
            Video provider
            <select
              value={prefs.video}
              onChange={(e) => set("video", e.target.value)}
            >
              <option value="local">Local renderer</option>
              <option value="heygen">HeyGen · your API key</option>
            </select>
          </label>
          <label>
            Local compute
            <select
              aria-label="Local compute"
              value={prefs.compute}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  compute: e.target.value,
                  quality: e.target.value === "gpu" ? "neural" : p.quality,
                }))
              }
            >
              <option value="cpu">CPU mode</option>
              <option value="gpu" disabled={!data.compute.gpu.available}>
                GPU mode{!data.compute.gpu.available ? " · unavailable" : ""}
              </option>
            </select>
          </label>
          <label>
            Default video quality
            <select
              value={prefs.quality}
              onChange={(e) => set("quality", e.target.value)}
            >
              <option value="fast" disabled={prefs.compute === "gpu"}>
                Fast portrait · audio-driven animation
              </option>
              <option value="neural">Neural lips · higher compute cost</option>
            </select>
          </label>
        </div>
        <p className="muted">
          {data.compute.gpu.available
            ? "CUDA worker is ready. Measure your workload before promising response times."
            : "No CUDA worker is available. Your administrator can connect one; CPU fast exports remain available."}{" "}
          Fast portraits use image warping, not neural lip synthesis. HeyGen
          renders on its own infrastructure.
        </p>
        <button className="button" disabled={!!busy}>
          Save provider choices
        </button>
      </form>
      <div className="settings-grid">
        {Object.entries(data.catalog).map(([name, p]) => {
          const saved = data.credentials.find((c) => c.provider === name),
            found = discoveries[name];
          return (
            <form
              className="panel stack-form"
              key={name + saved?.updated_at}
              onSubmit={(e) => {
                e.preventDefault();
                const values = Object.fromEntries(
                  new FormData(e.currentTarget),
                );
                if (!values.key) delete values.key;
                action(name, async () => {
                  await api("/provider-credentials/" + name, {
                    method: "PUT",
                    body: values,
                  });
                  toast(p.name + " saved securely");
                });
              }}
            >
              <h2>{p.name}</h2>
              <p>
                {saved
                  ? "Key saved · never returned to the browser"
                  : "No key saved"}
              </p>
              <label>
                API key
                <input
                  type="password"
                  name="key"
                  autoComplete="new-password"
                  placeholder={
                    saved
                      ? "Leave blank to retain current key"
                      : "Enter your own API key"
                  }
                  required={!saved}
                  maxLength={2048}
                />
              </label>
              {p.kind === "tts" && (
                <label>
                  Model
                  <select name="model" defaultValue={saved?.model || p.model}>
                    {p.models.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Voice{" "}
                {name === "elevenlabs" || name === "heygen" ? "ID" : "name"}
                <input
                  name="voice"
                  defaultValue={saved?.voice || p.voice}
                  maxLength={150}
                  list={"voices-" + name}
                />
              </label>
              <datalist id={"voices-" + name}>
                {found?.voices?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </datalist>
              {name === "heygen" && (
                <label>
                  HeyGen avatar ID
                  <input
                    name="avatar_id"
                    defaultValue={saved?.avatar_id || ""}
                    maxLength={150}
                    list="heygen-avatars"
                  />
                  <datalist id="heygen-avatars">
                    {found?.avatars?.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </datalist>
                  <small>
                    This selects an avatar from your HeyGen account. BENAI
                    portrait uploads are not automatically HeyGen avatars.
                  </small>
                </label>
              )}
              <div className="action-row">
                <button className="button" disabled={!!busy}>
                  Save {p.name}
                </button>
                {saved && (
                  <>
                    <button
                      className="button ghost"
                      type="button"
                      disabled={!!busy}
                      onClick={() =>
                        action(name, async () => {
                          const discovered = await api(
                            "/provider-credentials/" + name + "/test",
                            { method: "POST" },
                          );
                          setDiscoveries((d) => ({ ...d, [name]: discovered }));
                          toast(
                            "Connection checked; confirm model access with a voice preview",
                          );
                        })
                      }
                    >
                      Test connection
                    </button>
                    <button
                      className="button ghost"
                      type="button"
                      disabled={!!busy}
                      onClick={() =>
                        action(name, async () => {
                          await api("/provider-credentials/" + name, {
                            method: "DELETE",
                          });
                          toast(
                            "Key deleted; selected provider reset to local",
                          );
                        })
                      }
                    >
                      Delete key
                    </button>
                  </>
                )}
              </div>
              {(name === "heygen" || name === "elevenlabs") && (
                <small>
                  Save your key first, then test the connection to load your
                  account’s voices{name === "heygen" ? " and avatars" : ""}.
                  Select their IDs and save again before generating.
                </small>
              )}
              {saved?.tested_at && (
                <small>
                  Authenticated discovery succeeded{" "}
                  {new Date(saved.tested_at).toLocaleString()}
                </small>
              )}
            </form>
          );
        })}
      </div>
      <section className="panel stack-form">
        <h2>Voice preview</h2>
        <p>
          Uses the saved speech choice and may incur provider usage charges.
        </p>
        <button
          className="button ghost"
          disabled={!!busy || prefs.tts === "local"}
          onClick={() =>
            action("preview", async () => {
              const audio = await api("/provider-preview", {
                method: "POST",
                body: { text: "Hello, welcome to BENAI." },
                binary: true,
              });
              setPreview(URL.createObjectURL(audio));
            })
          }
        >
          Generate short preview
        </button>
        {preview && <audio controls src={preview} />}
        <small>
          Encrypted storage:{" "}
          {data.storage === "mongodb"
            ? "MongoDB · compatible with Atlas"
            : "local SQLite · Atlas not connected"}
          . Administrators can manage accounts but cannot retrieve your raw
          provider key through the API.
        </small>
      </section>
    </>
  );
}
export function RecoveryPage({ mode }) {
  const { refresh } = useContext(Auth),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const token = new URLSearchParams(location.search).get("token");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const values = Object.fromEntries(new FormData(e.currentTarget));
      const data = await api(
        "/auth/" +
          (mode === "forgot"
            ? "forgot-password"
            : mode === "reset"
              ? "reset-password"
              : "verify-email"),
        {
          method: "POST",
          body: mode === "forgot" ? values : { ...values, token },
        },
      );
      setMessage(
        mode === "forgot"
          ? data.message
          : mode === "reset"
            ? "Password reset. Existing sessions and API keys were revoked. Sign in again."
            : "Email verified.",
      );
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="public-shell">
      <Link to="/">BENAI</Link>
      <form className="panel stack-form" onSubmit={submit}>
        <h1>
          {mode === "forgot"
            ? "Reset your password"
            : mode === "reset"
              ? "Choose a new password"
              : "Verify your email"}
        </h1>
        {mode === "forgot" ? (
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
        ) : mode === "reset" ? (
          <label>
            New password
            <input
              type="password"
              name="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
        ) : (
          <p>Confirm your email with this one-use link.</p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {message ? (
          <p role="status">{message}</p>
        ) : (
          <button
            className="button"
            disabled={busy || (mode !== "forgot" && !token)}
          >
            {busy
              ? "Working…"
              : mode === "verify"
                ? "Verify email"
                : "Continue"}
          </button>
        )}
        <Link to="/login">Back to sign in</Link>
      </form>
    </main>
  );
}
export function AccountPage() {
  const [assets, loadAssets] = useLoad("/assets?all=1");
  const { user, refresh } = useContext(Auth),
    toast = useContext(Toast),
    navigate = useNavigate(),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false);
  async function exportData() {
    try {
      const response = await api("/account/export"),
        url = URL.createObjectURL(
          new Blob([JSON.stringify(response, null, 2)], {
            type: "application/json",
          }),
        ),
        link = document.createElement("a");
      link.href = url;
      link.download = "benai-account.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast(e.message, "error");
    }
  }
  return (
    <>
      <Heading title="Account & privacy">
        Control account access and your stored data.
      </Heading>
      <section className="panel stack-form">
        <h2>{user.email}</h2>
        <p>Email: {user.email_verified ? "verified" : "not verified"}</p>
        {!user.email_verified && (
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/auth/request-verification", { method: "POST" });
                toast("Check your email for the verification link");
                await refresh();
              } catch (e) {
                toast(e.message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Send verification email
          </button>
        )}
        <Link to="/forgot-password">Reset password</Link>
        <p>Password resets revoke existing sessions and integration keys.</p>
      </section>
      <section className="panel stack-form">
        <h2>Your data</h2>
        <button className="button ghost" onClick={exportData}>
          Export my account data
        </button>
        <p>
          Exports account records and transcripts. API secrets and session
          credentials are excluded. Download videos individually from the video
          studio.
        </p>
        <Link to="/privacy">Privacy notice</Link>
        <Link to="/terms">Service terms</Link>
      </section>
      <section className="panel stack-form">
        <h2>Saved portraits</h2>
        <p>
          Storage is bounded to four saved images per avatar slot in your plan.
          Delete unused portraits to free space.
        </p>
        {assets?.assets.map((asset) => (
          <div className="action-row" key={asset.id}>
            <img
              src={asset.image}
              alt="Saved portrait"
              loading="lazy"
              width="48"
              height="48"
            />
            <span>
              {asset.kind} · {new Date(asset.created_at).toLocaleDateString()}
            </span>
            <button
              className="button ghost"
              onClick={async () => {
                try {
                  await api("/assets/" + asset.id, { method: "DELETE" });
                  await loadAssets();
                  toast("Portrait deleted");
                } catch (e) {
                  toast(e.message, "error");
                }
              }}
            >
              Delete unused portrait
            </button>
          </div>
        ))}
      </section>
      <section className="panel stack-form">
        <h2>Delete account</h2>
        <p>
          Deletes your account, provider credentials, leads, transcripts and
          owned media. Shared pages stop working. Cancel paid billing first.
          Backups follow the operator’s retention policy.
        </p>
        {!deleting ? (
          <button className="button ghost" onClick={() => setDeleting(true)}>
            Start account deletion
          </button>
        ) : (
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("/account", {
                  method: "DELETE",
                  body: Object.fromEntries(new FormData(e.currentTarget)),
                });
                await refresh();
                navigate("/");
              } catch (e) {
                toast(e.message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Current password
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              Type DELETE
              <input name="confirmation" pattern="DELETE" required />
            </label>
            <button className="button" disabled={busy}>
              Permanently delete my account
            </button>
          </form>
        )}
      </section>
    </>
  );
}
export function GrowthPage() {
  const [data, load] = useLoad("/growth"),
    [catalog] = useLoad("/templates"),
    [library] = useLoad("/avatars"),
    toast = useContext(Toast),
    navigate = useNavigate(),
    [busy, setBusy] = useState(false),
    [template, setTemplate] = useState("local-business");
  async function perform(fn) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading title="Grow your audience">
        Build a useful demo, share it with permission, and collect interested
        visitors.
      </Heading>
      {data && (
        <>
          <div className="settings-grid growth-stats">
            {Object.entries(data.stats).map(([name, value]) => (
              <div className="panel" key={name}>
                <strong>{value}</strong>
                <p>{name.replaceAll("_", " ")}</p>
              </div>
            ))}
          </div>
          <section className="panel stack-form">
            <h2>Your referral link</h2>
            <input
              aria-label="Referral link"
              readOnly
              value={data.referral_url}
            />
            <button
              className="button ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(data.referral_url);
                  toast("Referral link copied");
                } catch {
                  toast("Copy the link from the field", "error");
                }
              }}
            >
              Copy referral link
            </button>
            <small>
              Tracks attributed account signups. No cash reward or automatic
              discount is promised.
            </small>
          </section>
        </>
      )}
      <div className="settings-grid">
        <form
          className="panel stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            perform(async () => {
              const d = await api("/templates/" + template + "/use", {
                method: "POST",
                body: values,
              });
              toast("Assistant created from your facts");
              navigate("/studio?avatar=" + d.avatar.id);
            });
          }}
        >
          <h2>Start from a useful template</h2>
          <label>
            Use case
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {catalog?.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            {catalog?.templates.find((t) => t.id === template)?.description}
          </p>
          <label>
            Assistant name
            <input name="name" required minLength={2} maxLength={80} />
          </label>
          <label>
            Business facts & contact details
            <textarea
              name="facts"
              rows={7}
              required
              minLength={10}
              maxLength={4000}
              placeholder="Services, prices, opening hours, policies, and a contact method. The assistant will use these facts."
            />
          </label>
          <button className="button" disabled={busy}>
            Create assistant
          </button>
        </form>
        <form
          className="panel stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            perform(async () => {
              await api("/demos", {
                method: "POST",
                body: { ...values, accept_public: true },
              });
              toast("Shareable demo published");
            });
          }}
        >
          <h2>Publish a demo page</h2>
          <label>
            Assistant
            <select name="avatar_id" aria-label="Demo assistant" required>
              {library?.avatars.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input name="title" required minLength={2} maxLength={100} />
          </label>
          <label>
            Description
            <textarea name="description" maxLength={300} />
          </label>
          <label className="check-label">
            <input type="checkbox" required />I agree to publish this
            assistant’s portrait and demo. Visitor chat uses my BENAI message
            quota.
          </label>
          <button className="button" disabled={busy}>
            Publish demo
          </button>
        </form>
      </div>
      {data && (
        <>
          <section className="panel stack-form">
            <h2>Your demo pages</h2>
            {data.demos.map((d) => (
              <div className="action-row" key={d.id}>
                <span>
                  {d.title} · {d.active ? "published" : "revoked"}
                </span>
                {d.active && (
                  <>
                    <Link to={"/d/" + d.id} target="_blank" rel="noreferrer">
                      Open shareable demo
                    </Link>
                    <button
                      className="button ghost"
                      disabled={busy}
                      onClick={() =>
                        perform(() =>
                          api("/demos/" + d.id, { method: "DELETE" }),
                        )
                      }
                    >
                      Revoke demo
                    </button>
                  </>
                )}
              </div>
            ))}
            {!data.demos.length && <p>Publish your first demo above.</p>}
          </section>
          <section className="panel stack-form">
            <h2>Consented leads</h2>
            {data.leads.map((l) => (
              <article key={l.id} className="lead-row">
                <h3>{l.name}</h3>
                <a href={"mailto:" + l.email}>{l.email}</a>
                <p>{l.message}</p>
                <small>
                  Consent recorded {new Date(l.consented_at).toLocaleString()}
                </small>
                <button
                  className="button ghost"
                  onClick={() =>
                    perform(() => api("/leads/" + l.id, { method: "DELETE" }))
                  }
                >
                  Delete lead
                </button>
              </article>
            ))}
            {!data.leads.length && (
              <p>
                No leads yet. Share a demo with people who would find it useful.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
export function DemoPage() {
  const { id } = useParams(),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [messages, setMessages] = useState([]),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  useEffect(() => {
    api("/public-demo/" + id)
      .then(async (d) => {
        setData(d);
        let visitor = sessionStorage.getItem("benai-visitor");
        if (!visitor) {
          visitor = crypto.randomUUID();
          sessionStorage.setItem("benai-visitor", visitor);
        }
        await api("/public-demo/" + id + "/visit", {
          method: "POST",
          body: { visitor },
        });
      })
      .catch((e) => setError(e.message));
  }, [id]);
  async function chat(e) {
    e.preventDefault();
    const form = e.currentTarget,
      text = new FormData(form).get("message");
    setBusy(true);
    try {
      const d = await api("/public-demo/" + id + "/chat", {
        method: "POST",
        body: { message: text, history: messages.slice(-8) },
      });
      setMessages((m) => [
        ...m,
        { role: "user", content: text },
        { role: "assistant", content: d.content },
      ]);
      form.reset();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="public-shell demo-shell">
      <Link to="/">BENAI · AI assistants</Link>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {data ? (
        <>
          <h1>{data.title}</h1>
          <p>{data.description}</p>
          <div className="settings-grid">
            <section className="panel demo-avatar">
              {data.avatar.kind === "realistic" ? (
                <PortraitAvatar
                  avatar={data.avatar}
                  speaking={false}
                  level={0}
                />
              ) : (
                <img src={data.avatar.image} alt={data.avatar.name} />
              )}
              <p>{data.avatar.name} · AI character</p>
            </section>
            <section className="panel stack-form">
              <h2>Try a conversation</h2>
              <div className="demo-messages" aria-live="polite">
                {messages.map((m, i) => (
                  <p key={i}>
                    <strong>
                      {m.role === "user" ? "You" : data.avatar.name}:{" "}
                    </strong>
                    {m.content}
                  </p>
                ))}
              </div>
              <form className="stack-form" onSubmit={chat}>
                <label>
                  Your message
                  <input name="message" required maxLength={2000} />
                </label>
                <button className="button" disabled={busy}>
                  {busy ? "Thinking…" : "Send message"}
                </button>
              </form>
              <small>
                AI can make mistakes. Confirm important information with the
                business. Avoid sharing sensitive information.
              </small>
            </section>
          </div>
          <form
            className="panel stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const values = Object.fromEntries(
                  new FormData(e.currentTarget),
                );
                await api("/public-demo/" + id + "/leads", {
                  method: "POST",
                  body: { ...values, consent: true },
                });
                setSent(true);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Interested? Leave your details.</h2>
            {sent ? (
              <p role="status">Your details were sent to the demo owner.</p>
            ) : (
              <>
                <label>
                  Name
                  <input name="name" required minLength={2} maxLength={80} />
                </label>
                <label>
                  Email
                  <input type="email" name="email" required maxLength={254} />
                </label>
                <label>
                  Message
                  <textarea name="message" maxLength={1000} />
                </label>
                <label className="check-label">
                  <input type="checkbox" required />I consent to the demo owner
                  receiving these details and contacting me about my enquiry.
                </label>
                <button className="button" disabled={busy}>
                  Send enquiry
                </button>
              </>
            )}
          </form>
          <p>
            <Link to={"/signup?ref=" + data.referral}>
              Create your own free BENAI assistant
            </Link>
          </p>
          <Link to="/privacy">Privacy</Link>
        </>
      ) : (
        !error && <p>Loading demo…</p>
      )}
    </main>
  );
}
export function OperationsPage() {
  const { user } = useContext(Auth),
    [data, load] = useLoad("/admin/operations");
  if (user.role !== "admin") return <p>Administrator access required.</p>;
  return (
    <>
      <Heading title="Service operations">
        Worker readiness and recent jobs. Run the documented backup and monitor
        commands on your host.
      </Heading>
      <button className="button ghost" onClick={load}>
        Refresh service status
      </button>
      {data && (
        <>
          <div className="settings-grid">
            {data.services.map((s) => (
              <div className="panel" key={s.name}>
                <h2>{s.name}</h2>
                <p>
                  {s.status} · {s.device || "—"}
                </p>
              </div>
            ))}
          </div>
          <section className="panel">
            <h2>Launch configuration</h2>
            <p>
              Storage: {data.storage} · SMTP:{" "}
              {data.mail_configured ? "configured" : "missing"} · production
              encryption key:{" "}
              {data.master_key_configured ? "configured" : "missing"}
            </p>
            <p>
              Processing videos: {data.processing} · failed among latest 100:{" "}
              {data.failed}
            </p>
            <p>
              Deployment: single application instance. This screen is not an
              uptime or load-test guarantee.
            </p>
            <Link to="/account">Account verification</Link>
          </section>
          <section className="panel">
            <h2>Recent render measurements</h2>
            {data.recent_renders.map((r) => (
              <p key={r.id}>
                {r.model || "Illustration"} · {r.quality || "illustrated"} ·{" "}
                {r.compute || "cpu"} ·{" "}
                {r.render_ms
                  ? Math.round(r.render_ms) / 1000 + "s render"
                  : "timing unavailable"}
              </p>
            ))}
          </section>
        </>
      )}
    </>
  );
}
export function LegalPage({ terms = false }) {
  return (
    <main className="public-shell">
      <Link to="/">BENAI</Link>
      <article className="panel stack-form">
        <h1>{terms ? "Service terms" : "Privacy notice"}</h1>
        <p>
          This notice describes the implemented BENAI pilot. Before a commercial
          launch, the operator must identify its business, support contact,
          jurisdiction and actual backup retention period.
        </p>
        {terms ? (
          <>
            <p>
              BENAI provides AI characters, conversations and video exports.
              Outputs may be inaccurate or contain visual artifacts. Confirm
              important information independently. Do not use an avatar to
              impersonate someone or upload portraits without permission.
            </p>
            <p>
              Local inference has compute limits. External providers bill your
              own account according to their terms. CPU/GPU selections do not
              guarantee latency. Free and paid-plan quotas are shown in your
              workspace; purchase is available only when the operator has
              configured billing.
            </p>
            <p>
              You retain your input rights. Only publish material you may share.
              Public demo visitors use the owner’s message allowance. Service
              availability and provider model access may change. These pilot
              terms do not replace the operator’s final commercial agreement.
            </p>
          </>
        ) : (
          <>
            <p>
              Your account, transcripts, avatars, jobs, and leads are stored in
              SQLite or the configured MongoDB database. Media is local or in
              configured R2. Provider API keys are encrypted on the server and
              never returned through the settings API.
            </p>
            <p>
              Selected external TTS providers receive the text needed for
              synthesis; HeyGen receives your video script and selected provider
              avatar/voice IDs. Those providers apply their own retention and
              billing policies. Choosing local inference keeps these model
              requests on the configured workers.
            </p>
            <p>
              Publishing a demo makes its title, description and portrait
              accessible to anyone with the link. Leads are shared with the demo
              owner only after consent. Chat history remains in the visitor’s
              browser for that session; the owner receives usage counts, not a
              saved visitor transcript.
            </p>
            <p>
              Demo activity is counted using hashed session identifiers for up
              to 30 days. Referral signup attribution is stored in account
              records. No advertising tracker is included. Export or delete your
              account through Account & privacy. Operators must set and disclose
              backup retention; deletion from a live database does not erase
              existing backups automatically.
            </p>
          </>
        )}
      </article>
    </main>
  );
}
