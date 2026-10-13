import { BENAIAvatar } from "/sdk.js";
const id = location.pathname.split("/").pop();
let avatar,
  history = [];
const messages = document.querySelector("#messages"),
  form = document.querySelector("#chat"),
  input = document.querySelector("#message"),
  button = document.querySelector("#send");
function add(role, text) {
  const div = document.createElement("div");
  div.className = "message " + role;
  div.textContent = text;
  messages.append(div);
  messages.scrollTop = messages.scrollHeight;
}
async function request(path, body) {
  const response = await fetch("/api/embed/" + id + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const d = await response.json();
    throw Error(d.error);
  }
  return response;
}
try {
  const d = await (await request("")).json();
  document.querySelector("#name").textContent = d.avatar.name;
  document.querySelector("#description").textContent = d.avatar.description;
  avatar = new BENAIAvatar(document.querySelector("#portrait"), d.avatar);
  add("assistant", `Hi, I’m ${d.avatar.name}. What can I help you with?`);
} catch (e) {
  add("error", e.message);
  button.disabled = true;
}
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  button.disabled = true;
  add("user", text);
  try {
    const d = await (
      await request("/chat", { message: text, history: history.slice(-8) })
    ).json();
    add("assistant", (d.demo ? "Demo response: " : "") + d.content);
    history.push(
      { role: "user", content: text },
      { role: "assistant", content: d.content },
    );
    try {
      const response = await request("/tts", {
        text: d.content.slice(0, 2000),
      });
      const url = URL.createObjectURL(await response.blob());
      await avatar?.speak(url);
      setTimeout(() => URL.revokeObjectURL(url), 180000);
    } catch {
      /* Voice is optional; the text response remains visible. */
    }
  } catch (e) {
    add("error", e.message);
  } finally {
    button.disabled = false;
    input.focus();
  }
});
window.addEventListener("pagehide", () => avatar?.destroy());
