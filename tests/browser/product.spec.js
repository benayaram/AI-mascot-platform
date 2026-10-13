import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const password = process.env.BENAI_E2E_PASSWORD;
async function register(page) {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Alex Morgan");
  await page.getByLabel("Email address").fill("alex@e2e.benai");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create free account" }).click();
  await expect(page).toHaveURL(/overview/);
}
async function login(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/overview/);
}
test("public website, responsive layout, and customer registration", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Give your ideas/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "/workspace/BENAI-output/website.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: "/workspace/BENAI-output/mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await register(page);
  await expect(
    page.getByRole("heading", { name: "Hello, Alex 👋" }),
  ).toBeVisible();
  await page.screenshot({
    path: "/workspace/BENAI-output/dashboard.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("real local AI conversation, speech playback, transcription, and persistence", async ({
  page,
}) => {
  await login(page, "alex@e2e.benai");
  await page.goto("/studio");
  await expect(
    page.getByRole("heading", { name: "Conversation studio" }),
  ).toBeVisible();
  await page
    .getByLabel("Message", { exact: true })
    .fill("What is two plus two? Answer in one short sentence.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".chat-message.assistant p")).toContainText(
    /four|4/i,
    { timeout: 30000 },
  );
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "/workspace/BENAI-output/conversation.png",
    fullPage: true,
  });
  const csrf = await page.evaluate(
    async () => (await (await fetch("/api/auth/me")).json()).csrf,
  );
  const speech = await page.request.post("/api/tts", {
    headers: { "X-CSRF-Token": csrf },
    data: {
      text: "Hello, welcome to BENAI. How can I help you today?",
      voice: "coral",
    },
  });
  expect(speech.status()).toBe(200);
  expect(speech.headers()["content-type"]).toContain("audio/wav");
  const audio = await speech.body();
  const transcript = await page.request.post("/api/transcribe", {
    headers: { "X-CSRF-Token": csrf },
    multipart: {
      audio: { name: "test.wav", mimeType: "audio/wav", buffer: audio },
    },
  });
  expect(transcript.status()).toBe(200);
  expect((await transcript.json()).text).toMatch(/hello|welcome|help/i);
  await page.goto("/conversations");
  await expect(
    page.getByRole("heading", { name: /What is two plus two/ }),
  ).toBeVisible();
});
test("custom avatar editor, illustration, and appearance customization", async ({
  page,
}) => {
  await login(page, "alex@e2e.benai");
  await page.goto("/avatars");
  await page
    .getByRole("button", { name: "Create avatar", exact: true })
    .click();
  await page.getByLabel("Character name").fill("My creative guide");
  await page
    .getByLabel("A short introduction")
    .fill("A little personality for my biggest ideas.");
  await page.getByLabel("Add glasses").check();
  await page.getByRole("button", { name: "Illustrate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Illustrate", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create avatar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My creative guide" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit My creative guide" }).click();
  await expect(page.getByLabel("Add glasses")).toBeChecked();
  await page.getByRole("button", { name: "Close dialog" }).click();
});
test("administrator plan grants, API keys, live website widget, and SDK", async ({
  page,
  browser,
}) => {
  await login(page, "admin@e2e.benai");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Admin platform" }),
  ).toBeVisible();
  await page.getByLabel("Plan for alex@e2e.benai").selectOption("pro");
  await expect(page.getByLabel("Plan for alex@e2e.benai")).toHaveValue("pro");
  await page.screenshot({
    path: "/workspace/BENAI-output/admin.png",
    fullPage: true,
  });
  const ctx = await browser.newContext();
  const customer = await ctx.newPage();
  await login(customer, "alex@e2e.benai");
  await customer.goto("/integrations");
  await customer.getByLabel("API key name").fill("Integration test");
  await customer
    .getByRole("button", { name: "Create key", exact: true })
    .click();
  const key = await customer.locator(".secret-box code").first().textContent();
  expect(key).toMatch(/^ps_/);
  const response = await customer.request.post("/api/v1/chat", {
    headers: { Authorization: "Bearer " + key },
    data: { avatar_id: "nova", message: "Say hello briefly." },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).demo).toBe(false);
  await customer
    .getByRole("button", { name: "Create widget", exact: true })
    .click();
  await expect(customer.locator(".secret-box code").last()).toContainText(
    "<iframe",
  );
  const snippet = await customer
    .locator(".secret-box code")
    .last()
    .textContent();
  const src = snippet.match(/src="([^"]+)"/)[1];
  const widget = await ctx.newPage();
  await widget.goto(src);
  await expect(widget.getByRole("heading", { name: "Nova" })).toBeVisible();
  await widget
    .getByLabel("Message", { exact: true })
    .fill("Say hello in one sentence");
  await widget.getByRole("button", { name: "↗" }).click();
  await expect(widget.locator(".message.assistant")).toHaveCount(2, {
    timeout: 30000,
  });
  expect(
    await widget.evaluate(
      () => document.querySelector("#portrait svg #mouth") !== null,
    ),
  ).toBe(true);
  await ctx.close();
});
test("local video job produces a playable private MP4", async ({ page }) => {
  await login(page, "alex@e2e.benai");
  await page.goto("/videos");
  await page
    .getByLabel("Your script")
    .fill("Hello from BENAI. Let’s make something amazing together.");
  await page.getByRole("button", { name: "Create video", exact: true }).click();
  await expect(page.locator(".video-result .status-tag")).toHaveText(
    "completed",
    { timeout: 60000 },
  );
  await page.screenshot({
    path: "/workspace/BENAI-output/videos.png",
    fullPage: true,
  });
  const link = page.getByRole("link", { name: "Download", exact: true });
  const response = await page.request.get(await link.getAttribute("href"));
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("video/mp4");
  const bytes = await response.body();
  expect(bytes.subarray(4, 8).toString()).toBe("ftyp");
  writeFileSync("/workspace/BENAI-output/sample-video.mp4", bytes);
  const anonymous = await fetch(
    "http://127.0.0.1:3130" + (await link.getAttribute("href")),
  );
  expect(anonymous.status).toBe(401);
  await page.getByRole("button", { name: "Play video" }).click();
  await expect(page.locator("video")).toHaveJSProperty("readyState", 4, {
    timeout: 15000,
  });
});

test("hands-free live voice records, transcribes, and receives an AI reply", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.BENAI_TEST_AUDIO,
    "Set BENAI_TEST_AUDIO to a real WAV speech fixture to exercise microphone capture",
  );
  await login(page, "alex@e2e.benai");
  await context.grantPermissions(["microphone"], {
    origin: "http://127.0.0.1:3130",
  });
  await page.goto("/studio");
  await page
    .getByRole("button", { name: "Start live voice", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End live voice", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Listening", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.locator(".chat-message.assistant")).toHaveCount(1, {
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "End live voice", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start live voice", exact: true }),
  ).toBeVisible();
});

test("realistic presets and consented custom portraits work in the studio", async ({
  page,
}) => {
  await login(page, "alex@e2e.benai");
  await page.goto("/avatars");
  await page.getByRole("button", { name: "Realistic", exact: true }).click();
  await expect(page.locator(".character-card")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Create avatar", exact: true })
    .click();
  await page.getByLabel("Avatar style").selectOption("realistic");
  await page.getByLabel("Character name").fill("My realistic host");
  await page
    .getByLabel("A short introduction")
    .fill("A realistic synthetic customer host.");
  await page.getByLabel("I own this portrait or have permission").check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create avatar", exact: true })
    .click();
  await page.goto("/studio?avatar=milo");
  await expect(page.locator(".realistic-avatar")).toHaveAttribute(
    "data-rig-ready",
    "true",
    { timeout: 15000 },
  );
  await page.screenshot({
    path: "/workspace/BENAI-output/v2-realistic-studio.png",
    fullPage: true,
  });
});

test("realistic embedded SDK rigs a private portrait without exposing account keys", async ({
  page,
}) => {
  await login(page, "alex@e2e.benai");
  const csrf = await page.evaluate(
    async () => (await (await fetch("/api/auth/me")).json()).csrf,
  );
  const image = await page.request.get("/realistic/milo.png");
  const upload = await page.request.post("/api/uploads", {
    headers: { "X-CSRF-Token": csrf },
    multipart: {
      kind: "realistic",
      image: {
        name: "milo.png",
        mimeType: "image/png",
        buffer: await image.body(),
      },
    },
  });
  expect(upload.status()).toBe(201);
  const src = (await upload.json()).image;
  const avatar = await page.request.post("/api/avatars", {
    headers: { "X-CSRF-Token": csrf },
    data: {
      name: "Private photo host",
      description: "A consented private synthetic portrait",
      category: "Support",
      prompt: "You are a helpful and concise AI guide.",
      kind: "realistic",
      rights_confirmed: true,
      image: src,
    },
  });
  expect(avatar.status()).toBe(201);
  const embed = await page.request.post("/api/embeds", {
    headers: { "X-CSRF-Token": csrf },
    data: { avatar_id: (await avatar.json()).avatar.id },
  });
  expect(embed.status()).toBe(201);
  const id = (await embed.json()).id;
  await page.goto("/widget/" + id);
  await expect(page.locator("#portrait canvas")).toBeVisible({
    timeout: 15000,
  });
  await page.getByLabel("Message").fill("Say hello briefly");
  await page.getByRole("button", { name: "↗" }).click();
  await expect(page.locator(".message.assistant")).toHaveCount(2, {
    timeout: 20000,
  });
  await page.screenshot({ path: "/workspace/BENAI-output/v2-widget.png" });
});
