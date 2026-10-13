import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import {
  Sparkles,
  ArrowRight,
  Plus,
  LayoutDashboard,
  Users,
  MessageSquare,
  Mic,
  Video,
  Code2,
  CreditCard,
  Shield,
  Search,
  Bell,
  ChevronDown,
  ArrowUpRight,
  Play,
  MoreHorizontal,
  Check,
  CheckCircle2,
  X,
  Upload,
  Send,
  Volume2,
  VolumeX,
  Trash2,
  Copy,
  LogOut,
  Menu,
  Globe,
  Layers,
  Key,
  Settings,
  Loader2,
  ExternalLink,
  Download,
  Headphones,
  Wand2,
  Palette,
  Heart,
  Terminal,
  StopCircle,
  Info,
} from "lucide-react";
import { api, setCsrf } from "./api";
import "./style.css";
import { useLiveVoice } from "./useLiveVoice";
import { useRealtime } from "./useRealtime";
import PortraitAvatar from "./PortraitAvatar";
import { Auth, Toast } from "./contexts";
import {
  AISettings,
  AccountPage,
  GrowthPage,
  DemoPage,
  OperationsPage,
  RecoveryPage,
  LegalPage,
} from "./V3Pages";
const colors = {
  nova: "#e7ddfc",
  atlas: "#d9eef3",
  luna: "#fce6d5",
  pixel: "#dcf0df",
  sage: "#f8dce5",
  orbit: "#e1e5fc",
};
const presets = ["nova", "atlas", "luna", "pixel", "sage", "orbit"];
const planNames = { free: "Free", pro: "Creator", business: "Business" };
function Logo({ small = false }) {
  return (
    <Link to="/" className={"logo " + (small ? "small" : "")}>
      <span className="logo-icon">
        <Sparkles size={21} />
      </span>
      <span>
        BEN<span className="logo-ai">AI</span>
      </span>
      {!small && <span className="logo-studio">STUDIO</span>}
    </Link>
  );
}
function Spinner() {
  return <Loader2 className="spin" size={18} />;
}
function Button({ children, variant = "", loading = false, ...props }) {
  return (
    <button
      className={"button " + variant}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
function Empty({ icon: Icon = MessageSquare, title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={28} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Modal({ title, children, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const before = document.activeElement;
    ref.current?.focus();
    const listener = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll(
          "button,input,select,textarea,a[href]",
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      before?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        className="modal"
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function App() {
  const [session, setSession] = useState(null),
    [loading, setLoading] = useState(true),
    [toast, setToast] = useState(null);
  const timer = useRef();
  const notify = (text, type = "success") => {
    setToast({ text, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 6000);
  };
  async function refresh() {
    try {
      const d = await api("/auth/me");
      setCsrf(d.csrf);
      setSession(d);
    } catch {
      setCsrf("");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const ref = new URLSearchParams(location.search).get("ref");
    if (/^[a-f0-9]{12}$/.test(ref || ""))
      sessionStorage.setItem("benai-ref", ref);
    refresh();
    return () => clearTimeout(timer.current);
  }, []);
  return (
    <Toast.Provider value={notify}>
      <Auth.Provider value={{ ...session, refresh, loading, setSession }}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/signup" element={<AuthPage register />} />
            <Route
              path="/forgot-password"
              element={<RecoveryPage mode="forgot" />}
            />
            <Route
              path="/reset-password"
              element={<RecoveryPage mode="reset" />}
            />
            <Route
              path="/verify-email"
              element={<RecoveryPage mode="verify" />}
            />
            <Route path="/d/:id" element={<DemoPage />} />
            <Route path="/privacy" element={<LegalPage />} />
            <Route path="/terms" element={<LegalPage terms />} />
            <Route element={<Layout />}>
              <Route path="/overview" element={<Overview />} />
              <Route path="/avatars" element={<Avatars />} />
              <Route path="/studio" element={<Studio />} />
              <Route path="/conversations" element={<Conversations />} />
              <Route path="/videos" element={<Videos />} />
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/ai-settings" element={<AISettings />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/growth" element={<GrowthPage />} />
              <Route path="/operations" element={<OperationsPage />} />
            </Route>
            <Route
              path="*"
              element={
                <div className="not-found">
                  <h1>Page not found</h1>
                  <Link to="/">Back to BENAI</Link>
                </div>
              }
            />
          </Routes>
        </BrowserRouter>
        {toast && (
          <div role="status" className={"toast " + toast.type}>
            <CheckCircle2 size={18} />
            {toast.text}
            <button
              aria-label="Dismiss notification"
              onClick={() => setToast(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </Auth.Provider>
    </Toast.Provider>
  );
}
function Landing() {
  const { user } = useContext(Auth);
  return (
    <div className="landing">
      <nav className="landing-nav">
        <Logo />
        <div className="landing-links">
          <a href="#features">Platform</a>
          <a href="#characters">Characters</a>
          <a href="#pricing">Pricing</a>
          <Link to="/integrations">Developers</Link>
        </div>
        <div className="nav-actions">
          {user ? (
            <Link className="button" to="/overview">
              Open studio <ArrowRight size={16} />
            </Link>
          ) : (
            <>
              <Link to="/login">Sign in</Link>
              <Link className="button" to="/signup">
                Start creating <ArrowRight size={16} />
              </Link>
            </>
          )}
        </div>
      </nav>
      <main>
        <div className="landing-hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="live-dot" /> A little personality. Endless
              possibilities.
            </span>
            <h1>
              Give your ideas
              <br />a face. <span>And a voice.</span>
            </h1>
            <p>
              Meet your next creative partner, customer assistant, or digital
              companion. Create expressive AI characters that make every
              conversation feel a little more human.
            </p>
            <div className="hero-buttons">
              <Link
                to={user ? "/overview" : "/signup"}
                className="button large"
              >
                Create your first avatar <ArrowRight size={18} />
              </Link>
              <a className="button ghost large" href="#characters">
                <Play size={16} /> Meet the characters
              </a>
            </div>
            <div className="hero-proof">
              <div className="mini-faces">
                {presets.slice(0, 4).map((x) => (
                  <img key={x} src={"/avatars/" + x + ".svg"} alt="" />
                ))}
              </div>
              <div>
                <strong>Your imagination, brought to life</strong>
                <small>Free to start · Open-weight AI · No card required</small>
              </div>
            </div>
          </div>
          <div className="hero-art">
            <div className="orbit-line one" />
            <div className="orbit-line two" />
            <span className="hero-spark spark-one">✦</span>
            <span className="hero-spark spark-two">✧</span>
            <div className="hero-avatar main">
              <img
                src="/avatars/nova.svg"
                alt="Nova, a friendly creative assistant"
              />
              <span className="character-label">
                <span className="live-dot" /> Nova is ready to chat
              </span>
            </div>
            <div className="hero-avatar second">
              <img src="/avatars/atlas.svg" alt="Atlas, a robot assistant" />
            </div>
            <div className="hero-avatar third">
              <img
                src="/avatars/pixel.svg"
                alt="Pixel, a playful green mascot"
              />
            </div>
            <div className="floating-bubble">
              <Sparkles size={16} /> “Let’s make something amazing.”
            </div>
            <div className="voice-bubble">
              <Mic size={16} />
              <div className="wave-bars">
                {Array.from({ length: 12 }, (_, i) => (
                  <i key={i} style={{ height: 10 + ((i * 7) % 24) }} />
                ))}
              </div>
              <span>Voice ready</span>
            </div>
          </div>
        </div>
        <div className="feature-strip">
          <span>
            <MessageSquare size={17} /> Real conversations
          </span>
          <span>
            <Mic size={17} /> Expressive voices
          </span>
          <span>
            <Video size={17} /> Avatar videos
          </span>
          <span>
            <Code2 size={17} /> Made to integrate
          </span>
        </div>
        <section className="landing-section">
          <span className="eyebrow">
            BENAI V3 · YOUR CHARACTERS. YOUR VOICE.
          </span>
          <div className="section-heading">
            <div>
              <h2>
                A human presence.
                <br />
                An entirely local AI.
              </h2>
              <p>
                Realistic portraits, streaming voice, and neural video export —
                powered by open-weight models on your own computer.
              </p>
            </div>
            <Link to="/studio" className="button">
              Try the live studio <ArrowRight size={16} />
            </Link>
          </div>
          <div className="character-grid realistic-showcase">
            {[
              ["amara", "Amara", "A thoughtful AI host"],
              ["milo", "Milo", "A friendly customer guide"],
              ["elena", "Elena", "An encouraging tutor"],
            ].map(([id, name, description]) => (
              <article key={id} className="character-card">
                <div className="character-image">
                  <img
                    src={"/realistic/" + id + ".png"}
                    alt={name + " synthetic portrait"}
                  />
                  <span className="character-badge">
                    Synthetic AI character
                  </span>
                </div>
                <div className="character-info">
                  <h3>{name}</h3>
                  <p>{description}</p>
                  <Link className="text-link" to={"/studio?avatar=" + id}>
                    Talk with {name}
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <p className="muted">
            Live visuals use local face-mesh animation. Neural talking-head
            videos render as queued jobs on CPU.
          </p>
        </section>
        <section id="features" className="landing-section">
          <span className="eyebrow">ONE STUDIO. SO MANY POSSIBILITIES.</span>
          <h2>
            More than an avatar.
            <br />A new way to connect.
          </h2>
          <div className="feature-grid">
            {[
              [
                Wand2,
                "Make it yours",
                "Pick a character or design your own. Shape their look, voice, and personality.",
              ],
              [
                MessageSquare,
                "Start a conversation",
                "Talk to your avatar with text or voice, powered by your own local model.",
              ],
              [
                Globe,
                "Take it anywhere",
                "Bring your assistant to your website with an embed or connect through the API.",
              ],
            ].map(([Icon, title, desc]) => (
              <article key={title}>
                <span className="feature-icon">
                  <Icon />
                </span>
                <h3>{title}</h3>
                <p>{desc}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="characters" className="landing-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                A PERSONALITY FOR EVERY POSSIBILITY
              </span>
              <h2>Meet your new team.</h2>
            </div>
            <Link to="/signup" className="text-link">
              Explore the studio <ArrowRight size={16} />
            </Link>
          </div>
          <div className="character-grid">
            {presets.map((x, i) => (
              <article className="character-card" key={x}>
                <div
                  className="character-image"
                  style={{ background: colors[x] }}
                >
                  <img src={"/avatars/" + x + ".svg"} alt={x} />
                  <span className="character-badge">
                    {
                      [
                        "Creative",
                        "Support",
                        "Education",
                        "Creative",
                        "Business",
                        "Companion",
                      ][i]
                    }
                  </span>
                </div>
                <div className="character-info">
                  <h3>{x[0].toUpperCase() + x.slice(1)}</h3>
                  <p>
                    {
                      [
                        "Your imagination’s new best friend.",
                        "Thoughtful support, always ready.",
                        "Learning with a little more warmth.",
                        "A playful spark for your next idea.",
                        "Make your brand feel more human.",
                        "Good company. Great conversation.",
                      ][i]
                    }
                  </p>
                  <Link to="/signup" className="text-link">
                    Meet {x[0].toUpperCase() + x.slice(1)}{" "}
                    <ArrowUpRight size={16} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section id="pricing" className="landing-section pricing-intro">
          <span className="eyebrow">START SMALL. DREAM BIG.</span>
          <h2>Your next idea starts here.</h2>
          <p>
            Free accounts include 100 messages each month and 3 custom avatars.
            <br />
            Paid customer tiers can be enabled when you connect a payment
            provider.
          </p>
          <Link className="button large" to={user ? "/billing" : "/signup"}>
            Explore your possibilities <ArrowRight size={18} />
          </Link>
        </section>
      </main>
      <footer>
        <Logo small />
        <p>Original characters. Real connections.</p>
        <span>© {new Date().getFullYear()} BENAI</span>
      </footer>
    </div>
  );
}
function AuthPage({ register = false }) {
  const { user, refresh } = useContext(Auth),
    toast = useContext(Toast),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (user) return <Navigate to="/overview" />;
  async function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const ref =
      new URLSearchParams(location.search).get("ref") ||
      sessionStorage.getItem("benai-ref");
    setBusy(true);
    setError("");
    try {
      const data = await api("/auth/" + (register ? "register" : "login"), {
        method: "POST",
        body: {
          ...Object.fromEntries(form),
          ...(register && /^[a-f0-9]{12}$/.test(ref || "")
            ? { referral: ref }
            : {}),
        },
      });
      setCsrf(data.csrf);
      await refresh();
      toast(
        register
          ? "Welcome to BENAI. Let’s bring your first character to life!"
          : "Welcome back!",
      );
      navigate("/overview");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-art">
        <Logo />
        <div>
          <span className="eyebrow">A LITTLE PERSONALITY GOES A LONG WAY.</span>
          <h1>
            Your ideas.
            <br />A whole new life.
          </h1>
          <img src="/avatars/nova.svg" alt="Nova" />
          <p>Create. Connect. Make something that matters.</p>
        </div>
        <small>Powered by your imagination. Built with BENAI.</small>
      </div>
      <div className="auth-form">
        <Link to="/" className="text-link">
          ← Back to home
        </Link>
        <form onSubmit={submit}>
          <span className="eyebrow">WELCOME TO YOUR STUDIO</span>
          <h1>
            {register ? "Let’s create something." : "Good to see you again."}
          </h1>
          <p>
            {register
              ? "Your first character is just a few clicks away."
              : "Sign in and pick up where your imagination left off."}
          </p>
          {register && (
            <label>
              Your name
              <input
                name="name"
                placeholder="Alex Morgan"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              placeholder={
                register ? "At least 12 characters" : "Enter your password"
              }
              required
              minLength={register ? 12 : 1}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <Button loading={busy} variant="full">
            {register ? "Create free account" : "Sign in"}{" "}
            <ArrowRight size={16} />
          </Button>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to BENAI?"}{" "}
            <Link to={register ? "/login" : "/signup"}>
              {register ? "Sign in" : "Create an account"}
            </Link>
          </p>
          {!register && <Link to="/forgot-password">Forgot password?</Link>}
          <div className="auth-note">
            <Shield size={16} />
            <span>
              {register
                ? "No credit card. No paid AI subscription required."
                : "Your workspace, characters, and conversations stay private."}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
const navItems = [
  [LayoutDashboard, "Overview", "/overview"],
  [Users, "Avatar library", "/avatars"],
  [Mic, "Conversation studio", "/studio"],
  [MessageSquare, "Conversations", "/conversations"],
  [Video, "Video studio", "/videos"],
  [Code2, "Integrations", "/integrations"],
  [Settings, "AI & compute", "/ai-settings"],
  [Sparkles, "Grow your audience", "/growth"],
  [Shield, "Account & privacy", "/account"],
];
function Layout() {
  const { user, loading, usage, refresh, providers } = useContext(Auth),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    toast = useContext(Toast),
    navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  if (loading)
    return (
      <div className="page-loading">
        <Spinner /> Opening your studio…
      </div>
    );
  if (!user)
    return <Navigate to="/login" state={{ from: location.pathname }} />;
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      await refresh();
      navigate("/");
    } catch (e) {
      toast(e.message, "error");
    }
  }
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (open ? "open" : "")}>
        <Logo small />
        <div className="workspace-picker">
          <div className="workspace-icon">{user.name[0]}</div>
          <div>
            <strong>{user.name.split(" ")[0]}’s workspace</strong>
            <small>Personal workspace</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-label">CREATE & CONNECT</span>
        <nav>
          {navItems.map(([Icon, title, path]) => (
            <NavLink key={path} to={path}>
              <Icon size={19} />
              {title}
              {path === "/studio" && <span className="tiny-badge">LIVE</span>}
            </NavLink>
          ))}
        </nav>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          <NavLink to="/billing">
            <CreditCard size={19} />
            Plans & billing
          </NavLink>
          {user.role === "admin" && (
            <NavLink to="/admin">
              <Shield size={19} />
              Admin platform
            </NavLink>
          )}
          {user.role === "admin" && (
            <NavLink to="/operations">
              <Settings size={19} />
              Service operations
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="plan-box">
            <div>
              <Sparkles size={17} />
              <strong>{planNames[user.plan]} plan</strong>
              <span>{usage?.messages || 0} used</span>
            </div>
            <div className="progress-track">
              <i
                style={{
                  width:
                    Math.min(
                      100,
                      ((usage?.messages || 0) /
                        (user.plan === "free"
                          ? 100
                          : user.plan === "pro"
                            ? 2000
                            : 10000)) *
                        100,
                    ) + "%",
                }}
              />
            </div>
            <small>Conversations reset each calendar month</small>
            <Link to="/billing">
              Explore plans <ArrowUpRight size={15} />
            </Link>
          </div>
          <button className="profile-button" onClick={logout} title="Sign out">
            <div className="user-circle">{user.name[0]}</div>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {open && (
        <div className="sidebar-overlay" onClick={() => setOpen(false)} />
      )}
      <div className="app-main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setOpen(!open)}
          >
            <Menu />
          </button>
          <form
            className="search-box"
            onSubmit={(e) => {
              e.preventDefault();
              navigate("/avatars?q=" + encodeURIComponent(query));
            }}
          >
            <Search size={17} />
            <input
              aria-label="Search avatars"
              placeholder="Search your creative universe…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>↵</kbd>
          </form>
          <div className="topbar-right">
            <span className="status-pill">
              <span className="live-dot" />
              {providers?.ai
                ? "V3 · Local or your providers"
                : providers?.demo
                  ? "Demo mode"
                  : "AI offline"}
            </span>
            <Link
              to="/billing"
              className="icon-button"
              aria-label="View usage and billing"
            >
              <Bell size={19} />
            </Link>
            <div className="user-circle purple">{user.name[0]}</div>
          </div>
        </header>
        <main className="page-content">
          <OutletContent />
        </main>
      </div>
    </div>
  );
}
import { Outlet } from "react-router-dom";
function OutletContent() {
  return <Outlet />;
}
function PageHeader({ eyebrow, title, description, children }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}
function useAvatars() {
  const [avatars, setAvatars] = useState([]),
    [loading, setLoading] = useState(true);
  const toast = useContext(Toast);
  async function load() {
    try {
      setAvatars((await api("/avatars")).avatars);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return { avatars, loading, load };
}
function AvatarCard({ avatar, onEdit }) {
  return (
    <article className="character-card">
      <Link
        to={"/studio?avatar=" + avatar.id}
        className="character-image"
        style={{ background: avatar.color }}
      >
        <img src={avatar.image} alt={avatar.name} />
        <span className="character-badge">{avatar.category}</span>
        <span className="avatar-hover">
          <Play size={22} />
        </span>
      </Link>
      <div className="character-info">
        <div className="card-title">
          <h3>{avatar.name}</h3>
          {onEdit && (
            <button
              className="icon-button"
              onClick={() => onEdit(avatar)}
              aria-label={"Edit " + avatar.name}
            >
              <MoreHorizontal size={19} />
            </button>
          )}
        </div>
        <p>{avatar.description}</p>
        <div className="card-bottom">
          <span>
            <span className="live-dot" />
            {avatar.public ? "Community avatar" : "Your avatar"}
          </span>
          <Link
            to={"/studio?avatar=" + avatar.id}
            aria-label={"Talk to " + avatar.name}
          >
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </div>
    </article>
  );
}
function Overview() {
  const { user, usage, providers } = useContext(Auth),
    { avatars, loading } = useAvatars();
  const [conversations, setConversations] = useState([]);
  useEffect(() => {
    api("/conversations")
      .then((d) => setConversations(d.conversations))
      .catch(() => {});
  }, []);
  return (
    <>
      <PageHeader
        eyebrow="YOUR CREATIVE UNIVERSE"
        title={`Hello, ${user.name.split(" ")[0]} 👋`}
        description="A new conversation. A new character. A little more possibility."
      >
        <Link to="/avatars?create=1" className="button">
          <Plus size={17} />
          Create avatar
        </Link>
      </PageHeader>
      <section className="welcome-banner">
        <div>
          <span className="banner-label">
            <Sparkles size={15} /> IMAGINATION, MEET PERSONALITY.
          </span>
          <h2>
            Your ideas deserve
            <br />a little character.
          </h2>
          <p>Bring them to life with an AI avatar that feels like you.</p>
          <Link to="/studio" className="button white">
            Start a conversation <ArrowRight size={16} />
          </Link>
        </div>
        <div className="banner-characters">
          <span className="banner-star one">✦</span>
          <img
            className="banner-character one"
            src="/avatars/pixel.svg"
            alt="Pixel"
          />
          <img
            className="banner-character two"
            src="/avatars/nova.svg"
            alt="Nova"
          />
          <img
            className="banner-character three"
            src="/avatars/atlas.svg"
            alt="Atlas"
          />
          <span className="banner-star two">✧</span>
          <span className="banner-speech">Hey, let’s create! ✨</span>
        </div>
      </section>
      <div className="stats-grid">
        {[
          [
            Users,
            "Your avatars",
            avatars.filter((a) => a.owner_id === user.id).length,
            "Made by you",
            "#eee7ff",
          ],
          [
            MessageSquare,
            "Conversations",
            conversations.length,
            "Ideas worth exploring",
            "#e4f1ed",
          ],
          [
            Mic,
            "Voice minutes",
            usage?.voice || 0,
            "Used this month",
            "#fff0e1",
          ],
          [
            Layers,
            "Messages sent",
            usage?.messages || 0,
            "Used this month",
            "#e8ecfc",
          ],
        ].map(([Icon, title, value, note, color]) => (
          <article className="stat-card" key={title}>
            <span style={{ background: color }}>
              <Icon size={21} />
            </span>
            <div>
              <small>{title}</small>
              <strong>{value}</strong>
              <p>{note}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="section-heading">
        <div>
          <h2>Meet your next conversation</h2>
          <p>A few friendly faces to get you started.</p>
        </div>
        <Link to="/avatars" className="text-link">
          View all avatars <ArrowRight size={16} />
        </Link>
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <div className="character-grid dashboard-grid">
          {avatars.slice(0, 4).map((a) => (
            <AvatarCard key={a.id} avatar={a} />
          ))}
        </div>
      )}
      <div className="overview-bottom">
        <section className="panel">
          <div className="section-heading compact">
            <h3>Pick up where you left off</h3>
            <Link to="/conversations" className="text-link">
              View all <ArrowUpRight size={15} />
            </Link>
          </div>
          {conversations.length ? (
            conversations.slice(0, 3).map((c) => (
              <Link
                className="conversation-row"
                key={c.id}
                to={"/studio?conversation=" + c.id + "&avatar=" + c.avatar_id}
              >
                <img src={c.avatar_image} alt="" />
                <div>
                  <strong>{c.title}</strong>
                  <small>With {c.avatar_name}</small>
                </div>
                <ArrowUpRight size={17} />
              </Link>
            ))
          ) : (
            <Empty title="Your first hello awaits">
              Start a conversation and it will appear here.
            </Empty>
          )}
        </section>
        <section className="integration-teaser">
          <span className="feature-icon">
            <Code2 />
          </span>
          <h3>
            A little personality.
            <br />
            On your platform.
          </h3>
          <p>
            Take your avatar to your website or app with our API and embedded
            widget.
          </p>
          <Link to="/integrations" className="text-link">
            Explore integrations <ArrowRight size={16} />
          </Link>
          <span className="code-decoration">{"{ }"}</span>
        </section>
      </div>
      {!providers?.ai && (
        <div className="info-bar">
          <Info size={18} />
          <p>
            {providers?.demo
              ? "Demo conversations are labeled sample responses. Connect the free local model to enable real AI."
              : "An administrator needs to start the local AI model to enable conversations."}
          </p>
        </div>
      )}
    </>
  );
}
function Avatars() {
  const { user } = useContext(Auth),
    { avatars, loading, load } = useAvatars(),
    location = useLocation(),
    [tab, setTab] = useState("All avatars"),
    [category, setCategory] = useState("All categories"),
    [query, setQuery] = useState(
      new URLSearchParams(location.search).get("q") || "",
    ),
    [edit, setEdit] = useState(
      new URLSearchParams(location.search).get("create") ? "new" : null,
    );
  const toast = useContext(Toast);
  useEffect(() => {
    setQuery(new URLSearchParams(location.search).get("q") || "");
    if (new URLSearchParams(location.search).get("create")) setEdit("new");
  }, [location.search]);
  const filtered = avatars.filter(
    (a) =>
      (tab !== "Realistic" || a.kind === "realistic") &&
      (tab !== "My avatars" || a.owner_id === user.id) &&
      (tab !== "Community" || a.public) &&
      (category === "All categories" || a.category === category) &&
      (a.name + " " + a.description)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="CHARACTERS WITH CHARACTER"
        title="Avatar library"
        description="Find your perfect personality. Or create one entirely your own."
      >
        <Button onClick={() => setEdit("new")}>
          <Plus size={17} />
          Create avatar
        </Button>
      </PageHeader>
      <div className="library-toolbar">
        <div className="tabs">
          {["All avatars", "Realistic", "My avatars", "Community"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={tab === t ? "active" : ""}
            >
              {t}
              {t === "All avatars" && <span>{avatars.length}</span>}
            </button>
          ))}
        </div>
        <div className="filter-actions">
          <div className="search-box inline">
            <Search size={16} />
            <input
              aria-label="Filter avatars"
              placeholder="Find a character…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Avatar category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {[
              "All categories",
              "Creative",
              "Support",
              "Education",
              "Business",
              "Companion",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      {loading ? (
        <Spinner />
      ) : filtered.length ? (
        <div className="character-grid library-grid">
          {filtered.map((a) => (
            <AvatarCard
              key={a.id}
              avatar={a}
              onEdit={
                a.owner_id === user.id || user.role === "admin"
                  ? setEdit
                  : undefined
              }
            />
          ))}
        </div>
      ) : (
        <Empty icon={Users} title="Room for a new personality">
          Create a character or try a different search.
        </Empty>
      )}
      {edit && (
        <AvatarEditor
          avatar={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
            toast("Your avatar is ready to meet the world.");
          }}
        />
      )}
    </>
  );
}
function AvatarEditor({ avatar, onClose, onSaved }) {
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    api("/assets")
      .then((r) => setRecent(r.assets))
      .catch(() => {});
  }, []);
  const { user, refresh, providers } = useContext(Auth),
    toast = useContext(Toast);
  const [kind, setKind] = useState(avatar?.kind || "illustrated"),
    [image, setImage] = useState(avatar?.image || "/avatars/nova.svg"),
    [busy, setBusy] = useState(false),
    [generation, setGeneration] = useState(false),
    [prompt, setPrompt] = useState(
      "A friendly purple robot with a curious personality",
    ),
    [error, setError] = useState("");
  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("image", file);
    form.append("kind", kind);
    setBusy(true);
    try {
      setImage((await api("/uploads", { method: "POST", body: form })).image);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    setGeneration(true);
    setError("");
    try {
      const result = await api("/avatars/generate", {
        method: "POST",
        body: {
          prompt,
          style: kind === "realistic" ? "realistic" : "illustration",
        },
      });
      setImage(result.image);
      toast(
        result.procedural
          ? "Illustration created."
          : "Your local model created a new AI portrait.",
      );
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setGeneration(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget),
      values = Object.fromEntries(form);
    values.kind = kind;
    values.rights_confirmed = form.get("rights_confirmed") === "on";
    values.public = form.get("public") === "on";
    values.appearance = {
      glasses: form.get("glasses") === "on",
      gesture: form.get("gesture") === "on",
      suitColor: form.get("suitColor") || "#9d77e8",
      hairColor: form.get("hairColor") || "#9d77e8",
    };
    for (const key of ["glasses", "gesture", "suitColor", "hairColor"])
      delete values[key];
    values.image = image;
    values.color = colors[image.split("/").pop().split(".")[0]] || "#e7ddfc";
    try {
      await api("/avatars" + (avatar ? "/" + avatar.id : ""), {
        method: avatar ? "PATCH" : "POST",
        body: values,
      });
      await refresh();
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api("/avatars/" + avatar.id, { method: "DELETE" });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function changeKind(value) {
    setKind(value);
    setImage(
      value === "realistic" ? "/realistic/amara.png" : "/avatars/nova.svg",
    );
    setPrompt(
      value === "realistic"
        ? "A fictional friendly adult with natural hair, a professional shirt, front-facing portrait, soft studio light"
        : "A friendly purple robot with a curious personality",
    );
  }
  return (
    <Modal
      title={avatar ? "Edit " + avatar.name : "A new character starts here"}
      onClose={onClose}
    >
      <form onSubmit={save}>
        <label>
          Avatar style
          <select value={kind} onChange={(e) => changeKind(e.target.value)}>
            <option value="illustrated">Illustrated character</option>
            <option value="realistic">Realistic human portrait</option>
          </select>
        </label>
        <div className="avatar-designer">
          <img className="designer-preview" src={image} alt="Avatar preview" />
          <div>
            <label>Choose a starting look</label>
            <div className="preset-picker">
              {(kind === "realistic"
                ? ["amara", "milo", "elena"]
                : presets
              ).map((name) => {
                const src =
                  kind === "realistic"
                    ? "/realistic/" + name + ".png"
                    : "/avatars/" + name + ".svg";
                return (
                  <button
                    type="button"
                    key={name}
                    className={image === src ? "selected" : ""}
                    aria-label={"Choose " + name}
                    onClick={() => setImage(src)}
                  >
                    <img src={src} alt="" />
                  </button>
                );
              })}
            </div>
            <label className="button ghost upload-button">
              <Upload size={15} />
              Upload your own
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={upload}
                hidden
              />
            </label>
            <small>One front-facing face · PNG/JPG/WebP · 5 MB maximum</small>
          </div>
        </div>
        {!avatar && (
          <div className="generation-box">
            <label htmlFor="image-prompt">Describe your character</label>
            <div>
              <input
                id="image-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                minLength={10}
              />
              <Button
                type="button"
                variant="ghost"
                loading={generation}
                onClick={generate}
              >
                <Wand2 size={16} />
                {providers?.images ? "AI image" : "Illustrate"}
              </Button>
            </div>
            <small>
              {kind === "realistic"
                ? "Self-hosted portrait generation can take about a minute on a CPU. The person is synthetic."
                : "Local open-weight image model; procedural fallback if the model is offline."}
            </small>
          </div>
        )}
        <div className="form-grid">
          <label>
            Character name
            <input
              name="name"
              defaultValue={avatar?.name}
              required
              minLength={2}
              maxLength={60}
              placeholder="Meet…"
            />
          </label>
          <label>
            Category
            <select
              name="category"
              defaultValue={avatar?.category || "Creative"}
            >
              {[
                "Creative",
                "Support",
                "Education",
                "Business",
                "Companion",
              ].map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>
        {kind === "illustrated" && (
          <>
            <div className="form-grid">
              <label>
                Suit color
                <input
                  type="color"
                  name="suitColor"
                  defaultValue={avatar?.appearance?.suitColor || "#9d77e8"}
                />
              </label>
              <label>
                Hair color
                <input
                  type="color"
                  name="hairColor"
                  defaultValue={avatar?.appearance?.hairColor || "#9d77e8"}
                />
              </label>
            </div>
            <div className="form-grid">
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="glasses"
                  defaultChecked={avatar?.appearance?.glasses}
                />
                Add glasses
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="gesture"
                  defaultChecked={avatar?.appearance?.gesture !== false}
                />
                Natural gestures
              </label>
            </div>
          </>
        )}
        {recent.length > 0 && (
          <>
            <label>Your recent portraits</label>
            <div className="preset-picker">
              {recent.slice(0, 8).map((asset) => (
                <button
                  type="button"
                  key={asset.id}
                  onClick={() => {
                    setImage(asset.image);
                    setKind(asset.kind);
                  }}
                  aria-label="Use saved portrait"
                >
                  <img src={asset.image} alt="Saved portrait" />
                </button>
              ))}
            </div>
          </>
        )}
        <label>
          A short introduction
          <textarea
            name="description"
            defaultValue={avatar?.description}
            rows={2}
            required
            minLength={3}
            maxLength={300}
          />
        </label>
        <label>
          Personality & instructions
          <textarea
            name="prompt"
            defaultValue={
              avatar?.prompt ||
              "You are a warm and helpful assistant. Answer clearly, ask thoughtful questions, and never invent facts."
            }
            rows={3}
            required
            minLength={10}
            maxLength={4000}
          />
        </label>
        <label>
          Voice style
          <select name="voice" defaultValue={avatar?.voice || "coral"}>
            {["coral", "alloy", "ash", "sage", "verse"].map((name) => (
              <option key={name} value={name}>
                {
                  {
                    coral: "Warm · LJSpeech",
                    alloy: "Neutral · LJSpeech",
                    ash: "Male · Bryce",
                    sage: "Calm · LJSpeech",
                    verse: "Bright · LJSpeech",
                  }[name]
                }
              </option>
            ))}
          </select>
        </label>
        {kind === "realistic" && (
          <label className="checkbox">
            <input
              type="checkbox"
              name="rights_confirmed"
              required
              defaultChecked={avatar?.rights_confirmed}
            />
            I own this portrait or have permission to use it as an AI avatar.
          </label>
        )}
        {user.role === "admin" && (
          <label className="checkbox">
            <input
              type="checkbox"
              name="public"
              defaultChecked={avatar?.public}
            />
            Publish to the community library
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          {avatar && (
            <Button
              type="button"
              variant="danger ghost"
              loading={busy}
              onClick={remove}
            >
              <Trash2 size={15} />
              Delete
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy || generation}>
            <Check size={16} />
            {avatar ? "Save changes" : "Create avatar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function LiveAvatar(props) {
  return props.avatar?.kind === "realistic" ? (
    <PortraitAvatar {...props} />
  ) : (
    <IllustratedAvatar {...props} />
  );
}
function IllustratedAvatar({ avatar, speaking, level = 0 }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    setSvg("");
    if (avatar?.image?.startsWith("/avatars/"))
      fetch(avatar.image)
        .then((r) => r.text())
        .then(setSvg);
  }, [avatar?.image]);
  let styled = svg;
  if (avatar?.appearance?.suitColor)
    styled = styled.replace(
      /(<path d="M57 320[^"]*" fill=")[^"]*/,
      "$1" + avatar.appearance.suitColor,
    );
  if (avatar?.appearance?.hairColor)
    styled = styled.replace(
      /(<path d="M86 157[^"]*" fill=")[^"]*/,
      "$1" + avatar.appearance.hairColor,
    );
  if (avatar?.appearance?.glasses)
    styled = styled.replace(
      "</svg>",
      '<g stroke="#403549" stroke-width="4" fill="none"><rect x="108" y="146" width="41" height="28" rx="9"/><rect x="174" y="146" width="41" height="28" rx="9"/><path d="M149 155h25"/></g></svg>',
    );
  const rendered = styled.replace(
    "translate(160 197) scale(1 1)",
    `translate(160 197) scale(1 ${speaking ? Math.max(0.3, level * 5) : 1})`,
  );
  return (
    <div
      className={
        "live-avatar " +
        (speaking && avatar?.appearance?.gesture !== false ? "speaking" : "")
      }
      style={{ background: avatar?.color }}
    >
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: rendered }} />
      ) : (
        <img src={avatar?.image} alt={avatar?.name} />
      )}
      <div className="avatar-glow" />
    </div>
  );
}
function Studio() {
  const { refresh, providers } = useContext(Auth),
    { avatars } = useAvatars(),
    location = useLocation(),
    toast = useContext(Toast);
  const params = new URLSearchParams(location.search);
  const [selected, setSelected] = useState(params.get("avatar") || "amara"),
    [conversation, setConversation] = useState(
      params.get("conversation") || undefined,
    ),
    [messages, setMessages] = useState([]),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [voice, setVoice] = useState(true),
    [recording, setRecording] = useState(false),
    [level, setLevel] = useState(0);
  const end = useRef(),
    audio = useRef(),
    audioCtx = useRef(),
    anim = useRef(),
    mic = useRef(),
    stream = useRef(),
    alive = useRef(true),
    audioQueue = useRef([]),
    queuePlaying = useRef(false),
    playbackDone = useRef(null);
  const live = useLiveVoice({
    busy,
    speaking,
    onTranscript: (message) => send(message),
    onAudio: (blob) => sendAudio(blob),
    onError: (message) => toast(message, "error"),
  });
  const avatar = avatars.find((a) => a.id === selected) || avatars[0];
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      audio.current?.pause();
      mic.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(anim.current);
      audioCtx.current?.close();
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    if (params.get("conversation"))
      api("/conversations/" + params.get("conversation"))
        .then((d) => {
          setMessages(d.messages);
          setSelected(d.conversation.avatar_id);
          setConversation(d.conversation.id);
        })
        .catch((e) => toast(e.message, "error"));
  }, [location.search]);
  useEffect(() => {
    const container = end.current?.parentElement;
    container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);
  function stopAudio(clearQueue = true) {
    if (clearQueue) audioQueue.current = [];
    playbackDone.current?.();
    playbackDone.current = null;
    audioCtx.current?.close().catch(() => {});
    audio.current?.pause();
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setLevel(0);
    cancelAnimationFrame(anim.current);
  }
  async function say(content, suppliedAudio = null) {
    stopAudio(false);
    try {
      if (suppliedAudio || providers?.tts) {
        const blob =
          suppliedAudio ||
          (await api("/tts", {
            method: "POST",
            body: { text: content.slice(0, 4000), voice: avatar.voice },
            binary: true,
          }));
        if (!alive.current) return;
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        audio.current = a;
        const ctx = new AudioContext();
        audioCtx.current = ctx;
        const source = ctx.createMediaElementSource(a),
          analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        const data = new Uint8Array(analyser.frequencyBinCount);
        function tick() {
          analyser.getByteFrequencyData(data);
          setLevel(data.reduce((s, v) => s + v, 0) / data.length / 255);
          anim.current = requestAnimationFrame(tick);
        }
        const ended = new Promise((resolve) => {
          playbackDone.current = resolve;
        });
        a.onended = () => {
          playbackDone.current?.();
          playbackDone.current = null;
          URL.revokeObjectURL(url);
          cancelAnimationFrame(anim.current);
          ctx.close();
          setSpeaking(false);
          setLevel(0);
        };
        setSpeaking(true);
        await a.play();
        tick();
        await ended;
        await refresh();
      } else if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(content);
        u.onstart = () => {
          setSpeaking(true);
          setLevel(0.3);
        };
        u.onend = u.onerror = () => {
          setSpeaking(false);
          setLevel(0);
        };
        speechSynthesis.speak(u);
      } else toast("This browser does not support speech playback.", "error");
    } catch (e) {
      setSpeaking(false);
      toast(e.message, "error");
    }
  }
  const [timing, setTiming] = useState(null),
    [modelState, setModelState] = useState("ready");
  const activeTurn = useRef(null);
  const realtime = useRealtime({
    onInterrupt: stopAudio,
    onEvent: (event) => {
      if (event.type === "state") setModelState(event.state);
      if (event.type === "transcript" && activeTurn.current?.audio)
        setMessages((m) => [...m, { role: "user", content: event.text }]);
      if (event.type === "token")
        setMessages((m) => {
          const last = m.at(-1);
          if (last?.streaming)
            return [
              ...m.slice(0, -1),
              { ...last, content: last.content + event.token },
            ];
          return [
            ...m,
            { role: "assistant", content: event.token, streaming: true },
          ];
        });
      if (event.type === "reply") {
        setConversation(event.conversation_id);
        setMessages((m) => {
          const last = m.at(-1);
          return last?.streaming
            ? [...m.slice(0, -1), { role: "assistant", content: event.content }]
            : m;
        });
      }
      if (event.type === "audio" && voice) {
        const bytes = Uint8Array.from(atob(event.audio), (c) =>
          c.charCodeAt(0),
        );
        audioQueue.current.push(new Blob([bytes], { type: event.mime }));
        if (!queuePlaying.current) {
          queuePlaying.current = true;
          (async () => {
            try {
              while (audioQueue.current.length && alive.current)
                await say("", audioQueue.current.shift());
            } finally {
              queuePlaying.current = false;
            }
          })();
        }
      }
      if (event.type === "done") {
        setTiming(event.timing);
        refresh();
      }
    },
  });
  async function send(message = text) {
    if (!message.trim() || busy || !avatar) return;
    setText("");
    setBusy(true);
    activeTurn.current = { audio: false };
    setMessages((m) => [...m, { role: "user", content: message }]);
    try {
      await realtime.turn({
        avatar_id: avatar.id,
        conversation_id: conversation,
        text: message,
        speak: voice,
      });
    } catch (e) {
      if (alive.current) {
        toast(e.message, "error");
        setMessages((m) => [...m, { role: "error", content: e.message }]);
      }
    } finally {
      if (alive.current) setBusy(false);
      activeTurn.current = null;
    }
  }
  async function sendAudio(blob) {
    if (busy || !avatar) return;
    setBusy(true);
    activeTurn.current = { audio: true };
    try {
      await realtime.audio(blob, {
        avatar_id: avatar.id,
        conversation_id: conversation,
        speak: voice,
      });
    } catch (e) {
      if (alive.current) toast(e.message, "error");
    } finally {
      if (alive.current) setBusy(false);
      activeTurn.current = null;
    }
  }
  async function record() {
    if (recording) {
      mic.current?.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast("Microphone access needs HTTPS and a supported browser.", "error");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const recorder = new MediaRecorder(stream.current),
        chunks = [];
      mic.current = recorder;
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        if (!alive.current) return;
        setRecording(false);
        await sendAudio(new Blob(chunks, { type: recorder.mimeType }));
      };
      recorder.start();
      setRecording(true);
      setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
          setRecording(false);
        }
      }, 30000);
    } catch (e) {
      toast("Microphone access was denied or unavailable.", "error");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="GOOD CONVERSATIONS START WITH HELLO"
        title="Conversation studio"
        description="A friendly face. A thoughtful answer. Your next idea starts here."
      >
        <Button
          variant={live.active ? "danger ghost" : "ghost"}
          onClick={live.toggle}
          disabled={!providers?.stt}
        >
          {live.active ? <StopCircle size={16} /> : <Headphones size={16} />}{" "}
          {live.active ? "End live voice" : "Start live voice"}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            stopAudio();
            setConversation(undefined);
            setMessages([]);
          }}
        >
          <Plus size={16} />
          New conversation
        </Button>
      </PageHeader>
      <div className="studio-grid">
        <section className="avatar-stage panel">
          <div className="stage-heading">
            <span className="status-pill">
              <span className="live-dot" />
              {speaking
                ? "Speaking"
                : recording || live.listening
                  ? "Listening"
                  : live.active
                    ? "Live conversation"
                    : "Ready to connect"}
            </span>
            <button
              className="icon-button"
              aria-label={voice ? "Disable voice" : "Enable voice"}
              onClick={() => {
                setVoice(!voice);
                stopAudio();
              }}
            >
              {voice ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
          </div>
          <LiveAvatar avatar={avatar} speaking={speaking} level={level} />
          <h2>{avatar?.name || "Your avatar"}</h2>
          <p>{avatar?.description}</p>
          <div className="voice-status">
            <div className={"wave-bars " + (speaking ? "active" : "")}>
              {Array.from({ length: 18 }, (_, i) => (
                <i
                  key={i}
                  style={{ height: speaking ? 8 + ((i * 13) % 30) : 6 }}
                />
              ))}
            </div>
            <small>
              {speaking
                ? "A little personality in every word"
                : "Say hello. Make a connection."}
            </small>
          </div>
          {timing && (
            <div className="rig-metrics">
              <span>First token: {timing.first_token_ms} ms</span>
              <span>Audio ready: {timing.audio_ready_ms} ms</span>
            </div>
          )}
          <label className="stage-select">
            Choose your character
            <select
              value={selected}
              disabled={busy}
              onChange={(e) => {
                stopAudio();
                live.stop();
                setSelected(e.target.value);
                setConversation(undefined);
                setMessages([]);
              }}
            >
              {avatars.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name} · {a.category}
                </option>
              ))}
            </select>
          </label>
          <small className="stage-disclaimer">
            {providers?.tts
              ? avatar?.kind === "realistic"
                ? "Live face mesh · " +
                  (providers.ttsProvider || "local") +
                  " voice"
                : (providers.ttsProvider || "local") +
                  " voice · Audio-responsive animation"
              : "Browser voice · Simplified speech animation"}
          </small>
        </section>
        <section className="chat-panel panel">
          <div className="chat-heading">
            <div>
              <span className="chat-symbol">
                <MessageSquare size={19} />
              </span>
              <div>
                <strong>Chat with {avatar?.name}</strong>
                <small>
                  {providers?.ai
                    ? "Self-hosted streaming AI · No provider key"
                    : "Demo conversation · Sample responses"}
                </small>
              </div>
            </div>
            <button
              className="icon-button"
              aria-label="Stop speech"
              onClick={() => {
                realtime.interrupt();
                stopAudio();
              }}
            >
              <StopCircle size={18} />
            </button>
          </div>
          <div className="chat-messages" aria-live="polite">
            {!messages.length ? (
              <div className="chat-welcome">
                <span className="empty-icon">
                  <Sparkles size={25} />
                </span>
                <h3>A world of ideas starts with hello.</h3>
                <p>
                  Ask a question, explore an idea, or just say hi.
                  <br />
                  {avatar?.name} is ready when you are.
                </p>
                <div className="suggestions">
                  {[
                    "Help me brainstorm an idea",
                    "Tell me a little about yourself",
                    "How can you help my customers?",
                  ].map((s) => (
                    <button key={s} disabled={busy} onClick={() => send(s)}>
                      {s}
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={"chat-message " + m.role}>
                  {m.role === "assistant" && <img src={avatar?.image} alt="" />}
                  <div>
                    {m.demo && (
                      <span className="demo-label">DEMO RESPONSE</span>
                    )}
                    <p>{m.content}</p>
                    {m.role === "assistant" && (
                      <button
                        className="message-audio"
                        onClick={() => say(m.content)}
                        aria-label="Read response aloud"
                      >
                        <Volume2 size={13} />
                        Listen
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
            {busy && (
              <div className="thinking">
                <i />
                <i />
                <i />
                <span>
                  {modelState === "synthesizing"
                    ? "Preparing voice…"
                    : modelState === "transcribing"
                      ? "Listening to your recording…"
                      : avatar?.name + " is thinking…"}
                </span>
              </div>
            )}
            <div ref={end} />
          </div>
          <div className="chat-compose">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input
                aria-label="Message"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Say something to ${avatar?.name || "your character"}…`}
                maxLength={8000}
                disabled={busy}
              />
              <button
                type="button"
                aria-label={
                  recording ? "Stop recording" : "Record voice message"
                }
                className={"icon-button " + (recording ? "recording" : "")}
                onClick={record}
                disabled={busy || !providers?.stt || live.active}
              >
                <Mic size={18} />
              </button>
              <button
                className="send-button"
                aria-label="Send message"
                disabled={busy || !text.trim() || !avatar}
              >
                {busy ? <Spinner /> : <Send size={18} />}
              </button>
            </form>
            <small>
              {recording
                ? "Recording… Click the microphone to send (30 seconds max)."
                : "AI can make mistakes. Keep sensitive information out of conversations."}
            </small>
          </div>
        </section>
      </div>
      {!providers?.stt && (
        <div className="info-bar">
          <Mic size={17} />
          <p>
            Voice input becomes available when the free local transcription
            model is started. You can use text and browser speech now.
          </p>
        </div>
      )}
    </>
  );
}
function Conversations() {
  const [rows, setRows] = useState([]),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true);
  const toast = useContext(Toast);
  async function load() {
    try {
      setRows((await api("/conversations")).conversations);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function remove(id) {
    try {
      await api("/conversations/" + id, { method: "DELETE" });
      load();
      toast("Conversation deleted.");
    } catch (e) {
      toast(e.message, "error");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="EVERY CONVERSATION HAS A STORY"
        title="Your conversations"
        description="Return to a good idea, pick up a thread, or start something new."
      >
        <Link className="button" to="/studio">
          <Plus size={16} />
          New conversation
        </Link>
      </PageHeader>
      <div className="panel">
        <div className="search-box inline history-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a conversation…"
            aria-label="Find a conversation"
          />
        </div>
        {loading ? (
          <Spinner />
        ) : rows.length ? (
          rows
            .filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
            .map((c) => (
              <div className="history-row" key={c.id}>
                <Link
                  to={"/studio?avatar=" + c.avatar_id + "&conversation=" + c.id}
                >
                  <img src={c.avatar_image} alt="" />
                  <div>
                    <h3>{c.title}</h3>
                    <p>
                      {c.avatar_name} ·{" "}
                      {new Date(c.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
                <button
                  className="icon-button danger"
                  onClick={() => remove(c.id)}
                  aria-label="Delete conversation"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))
        ) : (
          <Empty title="Your first hello awaits">
            Your conversations will be saved here as you explore.
          </Empty>
        )}
      </div>
    </>
  );
}
function Videos() {
  const { refresh, providers } = useContext(Auth),
    { avatars } = useAvatars(),
    toast = useContext(Toast);
  const [rows, setRows] = useState([]),
    [selected, setSelected] = useState("nova"),
    [script, setScript] = useState(
      "Welcome to BENAI! I’m your friendly AI character. Let’s bring your next great idea to life.",
    ),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(null),
    [compute, setCompute] = useState("cpu"),
    [quality, setQuality] = useState("fast"),
    [runtime, setRuntime] = useState(null),
    [videoProvider, setVideoProvider] = useState("local");
  async function load() {
    try {
      const d = await api("/videos");
      setRows(d.videos);
    } catch (e) {
      toast(e.message, "error");
    }
  }
  useEffect(() => {
    load();
    api("/provider-settings")
      .then((d) => {
        setCompute(d.settings.compute);
        setQuality(d.settings.quality);
        setRuntime(d.compute);
        setVideoProvider(d.settings.video);
      })
      .catch((e) => toast(e.message, "error"));
  }, []);
  useEffect(() => {
    if (!rows.some((v) => v.status === "processing")) return;
    const id = setInterval(async () => {
      try {
        await Promise.all(
          rows
            .filter((v) => v.status === "processing")
            .map((v) => api("/videos/" + v.id)),
        );
        await load();
      } catch (e) {
        toast(e.message, "error");
      }
    }, 1200);
    return () => clearInterval(id);
  }, [rows]);
  async function render(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/videos", {
        method: "POST",
        body: { avatar_id: selected, script, compute, quality },
      });
      toast("Your video is rendering. It will appear below when ready.");
      load();
      refresh();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  const a = avatars.find((a) => a.id === selected);
  return (
    <>
      <PageHeader
        eyebrow="A STORY WORTH BRINGING TO LIFE"
        title="Video studio"
        description="Turn a few words into an animated character video."
      >
        <span className="status-pill">
          <Video size={14} />
          {providers?.localVideo
            ? "Free local renderer"
            : "Connect a video renderer"}
        </span>
      </PageHeader>
      <div className="video-workspace">
        <div className="video-preview panel">
          <LiveAvatar avatar={a} speaking={false} />
          <span className="preview-label">
            {a?.kind === "realistic"
              ? quality === "fast"
                ? "FAST PORTRAIT · CPU ANIMATION"
                : "NEURAL LIPS · " + compute.toUpperCase() + " QUEUE"
              : "ILLUSTRATED VIDEO · 640 × 640"}
          </span>
          <h3>{a?.name}</h3>
          <p>
            {a?.kind === "realistic"
              ? quality === "fast"
                ? "Fast audio-driven portrait animation. Image warping, not neural lip synthesis."
                : "Local neural lip sync. CPU renders take longer than playback; GPU needs an available CUDA worker."
              : "Audio-responsive illustration with a local neural voice."}
          </p>
        </div>
        <form className="panel video-form" onSubmit={render}>
          <h3>Give your character something to say.</h3>
          <label>
            Character
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                if (
                  avatars.find((a) => a.id === e.target.value)?.kind ===
                  "realistic"
                )
                  setScript("Hello, welcome to BENAI.");
              }}
            >
              {avatars.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="settings-grid">
            <label>
              Compute mode
              <select
                aria-label="Video compute mode"
                value={compute}
                disabled={videoProvider !== "local"}
                onChange={(e) => {
                  setCompute(e.target.value);
                  if (e.target.value === "gpu") setQuality("neural");
                }}
              >
                <option value="cpu">CPU mode</option>
                <option value="gpu" disabled={!runtime?.gpu.available}>
                  GPU mode{!runtime?.gpu.available ? " · unavailable" : ""}
                </option>
              </select>
            </label>
            <label>
              Export quality
              <select
                aria-label="Export quality"
                value={quality}
                disabled={videoProvider !== "local"}
                onChange={(e) => setQuality(e.target.value)}
              >
                <option value="fast" disabled={compute === "gpu"}>
                  Fast portrait animation
                </option>
                <option value="neural">Neural lip sync</option>
              </select>
            </label>
          </div>
          <p>
            Video provider: {videoProvider}.{" "}
            <Link to="/ai-settings">
              Change provider or connect your own key
            </Link>
          </p>
          <label>
            Your script
            <textarea
              rows={8}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              required
              minLength={10}
              maxLength={
                a?.kind === "realistic" &&
                quality === "neural" &&
                compute === "cpu" &&
                videoProvider === "local"
                  ? 80
                  : 1000
              }
            />
            <small>
              {a?.kind === "realistic" &&
              quality === "neural" &&
              compute === "cpu" &&
              videoProvider === "local"
                ? script.length +
                  " / 80 characters · 6 seconds maximum on CPU neural mode"
                : script.length + " / 1,000 characters · 60 seconds maximum"}
            </small>
          </label>
          <div className="info-bar">
            <Info size={17} />
            <p>
              Free tier includes one video per month. Fast portraits use
              lightweight image animation; neural quality is a separate, slower
              option on CPU. External providers may charge your own account.
            </p>
          </div>
          <Button loading={busy} variant="full">
            <Video size={17} />
            Create video
          </Button>
        </form>
      </div>
      <div className="section-heading">
        <h2>Your videos</h2>
        <span className="muted">{rows.length} projects</span>
      </div>
      {rows.length ? (
        <div className="video-grid">
          {rows.map((v) => (
            <article className="panel video-result" key={v.id}>
              <div className="video-thumbnail">
                <img
                  src={avatars.find((a) => a.id === v.avatar_id)?.image}
                  alt=""
                />
                {v.status === "completed" ? (
                  <button onClick={() => setPreview(v)} aria-label="Play video">
                    <Play />
                  </button>
                ) : v.status === "processing" ? (
                  <Spinner />
                ) : (
                  <Info />
                )}
              </div>
              <h3>{v.avatar_name}</h3>
              <p>{v.script.slice(0, 85)}</p>
              <div className="card-bottom">
                <span className={"status-tag " + v.status}>{v.status}</span>
                {v.url && (
                  <a href={v.url} className="text-link" download>
                    <Download size={15} />
                    Download
                  </a>
                )}
              </div>
              {v.render_ms && (
                <small>
                  {v.model || "Local"} · {v.device || v.compute || "cpu"} ·{" "}
                  {(v.render_ms / 1000).toFixed(2)}s render
                  {v.total_ms
                    ? " · " + (v.total_ms / 1000).toFixed(2) + "s total"
                    : ""}
                </small>
              )}
              {v.error && <p className="form-error">{v.error}</p>}
            </article>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty icon={Video} title="Your first story starts here">
            Create a video and give your character a moment in the spotlight.
          </Empty>
        </div>
      )}
      {preview && (
        <Modal
          title={"A moment with " + preview.avatar_name}
          onClose={() => setPreview(null)}
        >
          <video
            controls
            autoPlay
            src={preview.url}
            className="rendered-video"
          />
        </Modal>
      )}
    </>
  );
}
function Integrations() {
  const { user } = useContext(Auth),
    { avatars } = useAvatars(),
    toast = useContext(Toast);
  const [keys, setKeys] = useState([]),
    [embeds, setEmbeds] = useState([]),
    [newKey, setNewKey] = useState(null),
    [code, setCode] = useState(""),
    [name, setName] = useState("My website"),
    [selected, setSelected] = useState("nova"),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [k, e] = await Promise.all([api("/keys"), api("/embeds")]);
      setKeys(k.keys);
      setEmbeds(e.embeds);
    } catch (e) {
      toast(e.message, "error");
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function createKey(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api("/keys", { method: "POST", body: { name } });
      setNewKey(r.key);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function createEmbed() {
    setBusy(true);
    try {
      const r = await api("/embeds", {
        method: "POST",
        body: { avatar_id: selected },
      });
      setCode(r.code);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard.");
    } catch {
      toast(
        "Clipboard access is unavailable. Select and copy the text.",
        "error",
      );
    }
  }
  async function remove(type, id) {
    try {
      await api("/" + type + "/" + id, { method: "DELETE" });
      load();
      toast("Access revoked.");
    } catch (e) {
      toast(e.message, "error");
    }
  }
  const snippet = `curl ${window.location.origin}/api/v1/chat \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"avatar_id":"nova","message":"Hello, Nova!"}'`;
  return (
    <>
      <PageHeader
        eyebrow="A LITTLE PERSONALITY. EVERYWHERE."
        title="Build with BENAI"
        description="Connect your characters to your website, app, or next big idea."
      />
      <div className="integration-banner">
        <Code2 size={32} />
        <div>
          <h2>Your character. Your platform.</h2>
          <p>Use a simple REST API or drop in an embedded chat widget.</p>
        </div>
        <span className="outline-pill">API v1</span>
      </div>
      {user.plan === "free" && (
        <div className="info-bar">
          <Key size={18} />
          <p>
            API keys and widgets require Creator or Business access. An
            administrator can grant a plan without a payment provider.
          </p>
          <Link to="/billing" className="text-link">
            Explore plans <ArrowRight size={15} />
          </Link>
        </div>
      )}
      <div className="integration-grid">
        <section className="panel">
          <h3>
            <Key size={18} />
            API keys
          </h3>
          <p className="muted">
            Keep keys on your server. Never expose them in browser code.
          </p>
          <form className="inline-form" onSubmit={createKey}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="API key name"
              required
              minLength={2}
              maxLength={80}
            />
            <Button loading={busy} disabled={user.plan === "free"}>
              <Plus size={16} />
              Create key
            </Button>
          </form>
          {newKey && (
            <div className="secret-box">
              <strong>Copy this key now. It will only be shown once.</strong>
              <code>{newKey}</code>
              <Button variant="ghost" onClick={() => copy(newKey)}>
                <Copy size={14} />
                Copy key
              </Button>
              <Button variant="ghost" onClick={() => setNewKey(null)}>
                Dismiss
              </Button>
            </div>
          )}
          {keys.length ? (
            keys.map((k) => (
              <div className="key-row" key={k.id}>
                <Key size={17} />
                <div>
                  <strong>{k.name}</strong>
                  <small>{k.prefix}••••••••</small>
                </div>
                <button
                  className="icon-button danger"
                  onClick={() => remove("keys", k.id)}
                  aria-label={"Revoke " + k.name}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <small className="muted">
              No active keys. Create one to get started.
            </small>
          )}
        </section>
        <section className="panel">
          <h3>
            <Globe size={18} />
            Website widget
          </h3>
          <p className="muted">
            A friendly assistant, embedded in a few seconds.
          </p>
          <div className="inline-form">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              aria-label="Widget avatar"
            >
              {avatars.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <Button
              loading={busy}
              disabled={user.plan === "free"}
              onClick={createEmbed}
            >
              <Plus size={16} />
              Create widget
            </Button>
          </div>
          <small className="muted">
            Public widgets consume your message allowance. Revoke any widget you
            no longer use.
          </small>
          {code && (
            <div className="secret-box">
              <code>{code}</code>
              <Button variant="ghost" onClick={() => copy(code)}>
                <Copy size={14} />
                Copy embed
              </Button>
            </div>
          )}
          {embeds.map((e) => (
            <div className="key-row" key={e.id}>
              <Globe size={17} />
              <div>
                <strong>{e.name} widget</strong>
                <small>{e.id.slice(0, 16)}…</small>
              </div>
              <button
                className="icon-button"
                aria-label="Copy widget"
                onClick={() =>
                  copy(
                    `<iframe src="${window.location.origin}/widget/${e.id}" width="380" height="560" title="AI assistant" style="border:0;border-radius:20px"></iframe>`,
                  )
                }
              >
                <Copy size={16} />
              </button>
              <button
                className="icon-button danger"
                onClick={() => remove("embeds", e.id)}
                aria-label="Revoke widget"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </section>
      </div>
      <section className="panel api-docs">
        <div className="section-heading">
          <div>
            <h3>From idea to integration.</h3>
            <p>Send your first message with a server-side request.</p>
          </div>
          <Button variant="ghost" onClick={() => copy(snippet)}>
            <Copy size={15} />
            Copy example
          </Button>
        </div>
        <pre>
          <code>{snippet}</code>
        </pre>
        <div className="endpoint-grid">
          {[
            ["GET", "/api/v1/avatars", "List your characters"],
            ["POST", "/api/v1/chat", "Send a message"],
            ["POST", "/api/v1/tts", "Generate speech"],
            ["POST", "/api/v1/videos", "Render an avatar video"],
          ].map(([method, path, title]) => (
            <div key={path}>
              <span>{method}</span>
              <code>{path}</code>
              <small>{title}</small>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
function Billing() {
  const { user, usage, providers, refresh } = useContext(Auth),
    toast = useContext(Toast);
  const [plans, setPlans] = useState({}),
    [busy, setBusy] = useState("");
  useEffect(() => {
    api("/plans").then((d) => setPlans(d.plans));
    if (new URLSearchParams(window.location.search).get("success")) {
      toast(
        "Checkout completed. Your plan updates after Stripe confirms the subscription.",
      );
      refresh();
    }
  }, []);
  async function checkout(plan) {
    setBusy(plan);
    try {
      const r = await api("/billing/checkout", {
        method: "POST",
        body: { plan },
      });
      window.location.assign(r.url);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  }
  async function portal() {
    setBusy("portal");
    try {
      const r = await api("/billing/portal", { method: "POST" });
      window.location.assign(r.url);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="ROOM FOR YOUR NEXT BIG IDEA"
        title="Plans & billing"
        description="Start with a hello. Grow into something extraordinary."
      >
        <Button
          variant="ghost"
          loading={busy === "portal"}
          onClick={portal}
          disabled={!providers?.billing}
        >
          <CreditCard size={16} />
          Manage subscription
        </Button>
      </PageHeader>
      <div className="billing-current panel">
        <span className="feature-icon">
          <Sparkles />
        </span>
        <div>
          <h3>Your {planNames[user.plan]} workspace</h3>
          <p>
            {usage?.messages || 0} messages · {usage?.voice || 0} voice minutes
            used this month
          </p>
        </div>
        <span className="status-tag completed">Active</span>
      </div>
      {!providers?.billing && (
        <div className="info-bar">
          <Info size={18} />
          <p>
            Payments are not connected. The free tier works without a
            subscription. Administrators can grant Creator and Business access
            directly.
          </p>
        </div>
      )}
      <div className="pricing-grid">
        {Object.entries(plans).map(([key, p]) => (
          <article
            className={"pricing-card " + (key === "pro" ? "featured" : "")}
            key={key}
          >
            {key === "pro" && (
              <span className="popular-label">ROOM TO CREATE</span>
            )}
            <span className="plan-icon">
              {key === "free" ? (
                <Heart />
              ) : key === "pro" ? (
                <Sparkles />
              ) : (
                <Layers />
              )}
            </span>
            <h2>{p.name}</h2>
            <p>
              {key === "free"
                ? "A little curiosity goes a long way."
                : key === "pro"
                  ? "For ideas that need room to grow."
                  : "Personality at the heart of your business."}
            </p>
            <div className="plan-price">
              ${p.price}
              <span>/ month</span>
            </div>
            <Button
              variant={key === "pro" ? "full" : "full ghost"}
              loading={busy === key}
              disabled={
                user.plan === key || key === "free" || !providers?.billing
              }
              onClick={() => checkout(key)}
            >
              {user.plan === key
                ? "Your current plan"
                : key === "free"
                  ? "Included free"
                  : providers?.billing
                    ? "Choose " + p.name
                    : "Available via administrator"}
              {user.plan !== key && <ArrowRight size={15} />}
            </Button>
            <div className="plan-features">
              {[
                `${p.messages.toLocaleString()} messages / month`,
                `${p.avatars} custom avatars`,
                `${p.voice} voice minutes / month`,
                `${p.videos} local videos / month`,
                `${p.images} avatar illustrations / month`,
                p.api
                  ? "API access & website widgets"
                  : "Built-in character library",
              ].map((x) => (
                <div key={x}>
                  <Check size={16} />
                  {x}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      <p className="pricing-footnote">
        Local AI needs your own compute. Paid APIs are optional. No paid
        provider is activated automatically.
      </p>
    </>
  );
}
function Admin() {
  const { user, refresh } = useContext(Auth),
    toast = useContext(Toast),
    [data, setData] = useState(null),
    [query, setQuery] = useState("");
  async function load() {
    try {
      setData(await api("/admin/overview"));
    } catch (e) {
      toast(e.message, "error");
    }
  }
  useEffect(() => {
    if (user.role === "admin") load();
  }, []);
  if (user.role !== "admin")
    return (
      <Empty icon={Shield} title="Administrator access required">
        This workspace is only available to administrators.
      </Empty>
    );
  async function update(id, values) {
    try {
      await api("/admin/users/" + id, { method: "PATCH", body: values });
      load();
      refresh();
      toast("Workspace access updated.");
    } catch (e) {
      toast(e.message, "error");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="YOUR PLATFORM, YOUR POSSIBILITIES"
        title="Admin platform"
        description="Manage your community, characters, plans, and connected services."
      >
        <Link className="button" to="/avatars?create=1">
          <Plus size={16} />
          Publish an avatar
        </Link>
      </PageHeader>
      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="stats-grid">
            {Object.entries(data.stats).map(([key, value]) => (
              <article className="stat-card" key={key}>
                <span style={{ background: "#eee7ff" }}>
                  <Layers size={21} />
                </span>
                <div>
                  <small>{key[0].toUpperCase() + key.slice(1)}</small>
                  <strong>{value}</strong>
                  <p>Across your platform</p>
                </div>
              </article>
            ))}
          </div>
          <section className="panel">
            <div className="section-heading">
              <h3>Connected services</h3>
              <span className="muted">
                Configure credentials and model paths securely on the server.
              </span>
            </div>
            <div className="provider-grid">
              {[
                ["ai", "AI conversations", "Self-hosted Qwen"],
                ["tts", "Speech synthesis", "Local Piper voice"],
                ["stt", "Voice recognition", "Local Whisper model"],
                ["localVideo", "Illustrated video", "FFmpeg + local speech"],
                ["video", "Realistic neural video", "Self-hosted MuseTalk"],
                ["images", "AI image generation", "Self-hosted Tiny-SD"],
                ["billing", "Subscriptions", "Optional Stripe"],
              ].map(([key, title, desc]) => (
                <div key={key}>
                  <div>
                    <strong>{title}</strong>
                    <small>{desc}</small>
                  </div>
                  <span
                    className={
                      "status-tag " +
                      (data.providers[key] ? "completed" : "inactive")
                    }
                  >
                    {data.providers[key] ? "Connected" : "Not connected"}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="panel admin-users">
            <div className="section-heading">
              <h3>Customer access</h3>
              <div className="search-box inline">
                <Search size={15} />
                <input
                  placeholder="Find a customer…"
                  aria-label="Search customers"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Plan</th>
                    <th>Role</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users
                    .filter((u) =>
                      (u.name + u.email)
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name}</strong>
                          <small>{u.email}</small>
                        </td>
                        <td>
                          <select
                            aria-label={"Plan for " + u.email}
                            value={u.plan}
                            onChange={(e) =>
                              update(u.id, { plan: e.target.value })
                            }
                          >
                            {Object.entries(planNames).map(([v, n]) => (
                              <option key={v} value={v}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            aria-label={"Role for " + u.email}
                            value={u.role}
                            disabled={u.id === user.id}
                            onChange={(e) =>
                              update(u.id, { role: e.target.value })
                            }
                          >
                            <option value="customer">Customer</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td>{new Date(u.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h3>Activity log</h3>
            {data.audit.length ? (
              data.audit.slice(0, 15).map((a) => (
                <div className="audit-row" key={a.id}>
                  <Shield size={15} />
                  <strong>{a.action.replaceAll(".", " · ")}</strong>
                  <small>{a.created_at}</small>
                </div>
              ))
            ) : (
              <p className="muted">
                Administrative actions will be recorded here.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
