/** BENAI Avatar SDK. Original 2D rendering; amplitude-based mouth animation. */
export class BENAIAvatar {
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      name: "Nova",
      image: "/avatars/nova.svg",
      gesture: true,
      ...options,
    };
    this.listeners = new Map();
    this.destroyed = false;
    element.innerHTML = "";
    this.frame = document.createElement("div");
    Object.assign(this.frame.style, {
      width: "100%",
      height: "100%",
      overflow: "hidden",
      borderRadius: "50%",
      position: "relative",
    });
    element.append(this.frame);
    this.load(this.options.image);
  }
  async load(url) {
    if (this.destroyed) return;
    try {
      if (
        /\/avatars\/[a-z]+\.svg$/.test(new URL(url, location.href).pathname)
      ) {
        const response = await fetch(url);
        if (!response.ok) throw Error("Avatar asset unavailable");
        const text = await response.text();
        const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
        const svg = parsed.documentElement;
        if (
          svg.tagName.toLowerCase() !== "svg" ||
          svg.querySelector("script,foreignObject,image,use") ||
          [svg, ...svg.querySelectorAll("*")].some((node) =>
            [...node.attributes].some(
              (a) =>
                /^on/i.test(a.name) ||
                (a.name !== "xmlns" &&
                  /(?:javascript:|https?:)/i.test(a.value)),
            ),
          )
        )
          throw Error("Unsafe avatar asset");
        if (this.destroyed) return;
        this.frame.replaceChildren(document.importNode(svg, true));
        const rendered = this.frame.firstChild;
        rendered.style.width = "100%";
        rendered.style.height = "100%";
        this.mouth = rendered.querySelector("#mouth");
        this.applyAppearance();
      } else {
        const { createPortraitRig } = await import("/portrait-rig.js");
        this.rig = await createPortraitRig(this.frame, {
          image: url,
          name: this.options.name,
        });
        if (this.destroyed) {
          this.rig.destroy();
          return;
        }
      }
      this.emit("ready", { name: this.options.name });
    } catch (e) {
      this.emit("error", e);
    }
  }
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }
  emit(event, data) {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }
  setAppearance(values) {
    this.options = { ...this.options, ...values };
    this.applyAppearance();
  }
  applyAppearance() {
    const svg = this.frame.querySelector("svg");
    if (!svg) return;
    svg.querySelector("#benai-glasses")?.remove();
    if (this.options.glasses) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.id = "benai-glasses";
      g.innerHTML =
        '<rect x="108" y="146" width="41" height="28" rx="9" fill="none" stroke="#403549" stroke-width="4"/><rect x="174" y="146" width="41" height="28" rx="9" fill="none" stroke="#403549" stroke-width="4"/><path d="M149 155h25" stroke="#403549" stroke-width="4"/>';
      svg.append(g);
    }
    const paths = [...svg.querySelectorAll("path")];
    if (/^#[0-9a-f]{6}$/i.test(this.options.suitColor || "")) {
      const body = paths.find((p) =>
        p.getAttribute("d")?.startsWith("M57 320"),
      );
      body?.setAttribute("fill", this.options.suitColor);
    }
    if (/^#[0-9a-f]{6}$/i.test(this.options.hairColor || "")) {
      const hair = paths.find((p) =>
        p.getAttribute("d")?.startsWith("M86 157"),
      );
      hair?.setAttribute("fill", this.options.hairColor);
    }
  }
  animate(analyser) {
    const values = new Uint8Array(analyser.fftSize);
    const started = performance.now();
    const step = () => {
      if (this.destroyed) return;
      analyser.getByteTimeDomainData(values);
      let total = 0;
      for (const n of values) total += ((n - 128) / 128) ** 2;
      const level = Math.sqrt(total / values.length);
      this.rig?.setLevel(Math.min(1, level * 8));
      this.mouth?.setAttribute(
        "transform",
        `translate(160 197) scale(1 ${Math.max(0.2, Math.min(3, level * 20))})`,
      );
      if (this.options.gesture)
        this.frame.style.transform = `translateY(${Math.sin((performance.now() - started) / 500) * 2}px) rotate(${Math.sin((performance.now() - started) / 700) * 0.5}deg)`;
      this.emit("level", level);
      this.animation = requestAnimationFrame(step);
    };
    step();
  }
  async speak(url) {
    this.stop();
    try {
      this.context = new AudioContext();
      this.audio = new Audio(url);
      this.audio.crossOrigin = "anonymous";
      const source = this.context.createMediaElementSource(this.audio),
        analyser = this.context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(this.context.destination);
      this.audio.onended = () => this.stop();
      await this.audio.play();
      this.animate(analyser);
      this.emit("state", "speaking");
    } catch (e) {
      this.stop();
      this.emit("error", e);
      throw e;
    }
  }
  async connectStream(stream) {
    this.stop();
    this.context = new AudioContext();
    const source = this.context.createMediaStreamSource(stream),
      analyser = this.context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(this.context.destination);
    await this.context.resume();
    this.animate(analyser);
    this.emit("state", "speaking");
  }
  stop() {
    cancelAnimationFrame(this.animation);
    this.audio?.pause();
    this.context?.close().catch(() => {});
    this.context = null;
    this.rig?.setLevel(0);
    this.mouth?.setAttribute("transform", "translate(160 197) scale(1 1)");
    if (this.frame) this.frame.style.transform = "";
    this.emit("state", "idle");
  }
  destroy() {
    this.stop();
    this.destroyed = true;
    this.rig?.destroy();
    this.listeners.clear();
    this.element.replaceChildren();
  }
}
