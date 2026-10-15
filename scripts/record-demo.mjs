/** Records the real app; starts with a new disposable local customer, never paid API keys.
 * Run with the built app and model workers running. Output is docs/demo/v4-walkthrough.mp4.
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
const base = process.env.BENAI_DEMO_URL || "http://127.0.0.1:3001";
if (!existsSync("/tmp/benai-water-vapour.mp4")) {
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x16364f:s=640x360:r=24:d=5",
      "-vf",
      "drawbox=x=0:y=285:w=640:h=75:color=0x2cb9dc:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='EVAPORATION':fontcolor=white:fontsize=28:x=32:y=24,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='water vapour':fontcolor=0xa7f3dd:fontsize=28:x=215:y=260-30*t",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "/tmp/benai-water-vapour.mp4",
    ],
    { stdio: "inherit" },
  );
  if (result.status)
    throw Error("Example teaching clip could not be generated");
}
const r = await fetch(base + "/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "BENAI Demo Teacher",
    email: "walkthrough-" + Date.now() + "@demo.benai",
    password: randomBytes(16).toString("hex"),
  }),
});
const me = await r.json();
if (!r.ok) throw Error(me.error);
const cookie = r.headers.get("set-cookie").split(";")[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
mkdirSync("/tmp/benai-recording", { recursive: true });
mkdirSync("docs/demo", { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: {
    dir: "/tmp/benai-recording",
    size: { width: 1440, height: 1000 },
  },
});
await context.addCookies([
  { name: "persona_session", value: cookie.split("=")[1], url: base },
]);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const marks = [],
  started = Date.now();
const chapter = (title) => {
  marks.push({ seconds: Math.round((Date.now() - started) / 1000), title });
  console.log(title);
};
const pause = (ms = 2200) => page.waitForTimeout(ms);
try {
  chapter("BENAI V4: running full-stack product");
  await page.goto(base + "/overview");
  await pause();
  chapter("Private knowledge sources");
  await page.getByRole("link", { name: "Knowledge sources" }).click();
  await page.getByLabel("Source name").fill("School science · The water cycle");
  await page
    .getByLabel("Facts and reference text")
    .fill(
      "Evaporation: the sun heats liquid water into vapour. Condensation: vapour cools into liquid droplets that form clouds. Precipitation: water falls as rain.",
    );
  await page.getByRole("button", { name: "Save source", exact: true }).click();
  await page.getByText("Source added", { exact: true }).waitFor();
  await pause();
  chapter("A real local-model answer, spoken by the avatar");
  await page.goto(base + "/studio?avatar=elena");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Explain evaporation in one short sentence.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByText("Reference sources", { exact: true }).waitFor();
  await page.waitForFunction(
    () => !document.querySelector('input[aria-label="Message"]')?.disabled,
  );
  await pause(6500);
  chapter("Telugu and provider choice; hardware availability is checked");
  await page.goto(base + "/ai-settings");
  await page.getByLabel("Conversation language").selectOption("te");
  await page.getByLabel("Speech provider").selectOption("espeak");
  await page.getByRole("button", { name: "Save provider choices" }).click();
  await page.getByText("Provider choices saved", { exact: true }).waitFor();
  await pause();
  // Return to English for this example lesson. No paid service is selected.
  await page.getByLabel("Conversation language").selectOption("en");
  await page.getByLabel("Speech provider").selectOption("local");
  await page.getByRole("button", { name: "Save provider choices" }).click();
  await pause(1000);
  chapter("Institute mode: an editable lesson with supporting video");
  await page.getByRole("link", { name: "Institute lessons" }).click();
  await page
    .getByLabel("Lesson title", { exact: true })
    .fill("The water cycle · BENAI classroom");
  await page
    .getByLabel("Spoken explanation")
    .fill(
      "The sun warms water. It rises as vapour, forms clouds, and returns as rain.",
    );
  await page
    .getByLabel(/Upload teaching media/)
    .setInputFiles("/tmp/benai-water-vapour.mp4");
  await page.getByText("Teaching media uploaded", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add scene", exact: true }).click();
  await page
    .getByLabel("Scene heading", { exact: true })
    .nth(1)
    .fill("See evaporation in motion");
  await page
    .getByLabel("Spoken explanation")
    .nth(1)
    .fill(
      "Warm water rises as vapour. When it cools, tiny droplets form clouds.",
    );
  await page
    .getByLabel("Supporting image or video")
    .nth(1)
    .selectOption({ label: "benai-water-vapour.mp4" });
  await page.getByRole("button", { name: "Save lesson", exact: true }).click();
  await page.getByText("Lesson saved", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Play video", exact: true })
    .first()
    .click();
  await pause(2500);
  chapter("Real MP4 export with speech, animated avatar, visuals and captions");
  await page
    .getByRole("button", { name: "Export narrated MP4", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Download MP4", exact: true })
    .waitFor({ timeout: 180000 });
  await pause(1200);
  const url = await page
    .getByRole("link", { name: "Download MP4", exact: true })
    .getAttribute("href");
  const media = await context.request.get(base + url);
  if (!media.ok()) throw Error("Lesson download failed");
  writeFileSync("docs/demo/v4-institute-lesson.mp4", await media.body());
  const captions = await context.request.get(
    base + url.replace("/download", "/captions"),
  );
  writeFileSync("docs/demo/v4-institute-captions.vtt", await captions.text());
  await page
    .locator("video")
    .last()
    .evaluate((v) => {
      v.muted = true;
      v.play();
    });
  await pause(10500);
  await page.screenshot({ path: "docs/demo/v4-institute.png", fullPage: true });
  chapter("Lesson questions use the real AI backend");
  await page
    .getByLabel("Your question", { exact: true })
    .fill("Why does water form clouds?");
  await page
    .getByRole("button", { name: "Explain this doubt", exact: true })
    .click();
  await page
    .getByText(/Uses your selected answer and voice providers/)
    .scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent === "Thinking…",
      ),
  );
  await pause(3500);
  chapter("Customer integrations and plan limits");
  await page.goto(base + "/integrations");
  await pause(2500);
  await page.goto(base + "/billing");
  await pause(2500);
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  const source = await video.path();
  writeFileSync(
    "docs/demo/v4-walkthrough-chapters.json",
    JSON.stringify({ chapters: marks, browser_errors: errors }, null, 2) + "\n",
  );
  const ff = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-i",
      source,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "25",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "docs/demo/v4-walkthrough.mp4",
    ],
    { stdio: "inherit" },
  );
  if (ff.status) throw Error("Recording conversion failed");
  if (errors.length)
    throw Error("Browser runtime errors: " + errors.join("; "));
}
