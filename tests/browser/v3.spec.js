import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const password = process.env.BENAI_E2E_PASSWORD;
async function signup(page, email) {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("V3 creator");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create free account" }).click();
  await expect(page).toHaveURL(/overview/);
}
test("customer provider settings save and delete private keys and explain unavailable GPU mode", async ({
  page,
}) => {
  await signup(
    page,
    "providers-" + randomBytes(4).toString("hex") + "@browser.benai",
  );
  await page.goto("/ai-settings");
  await expect(
    page.getByRole("heading", { name: "AI providers & compute" }),
  ).toBeVisible();
  const form = page.locator("form").filter({
    has: page.getByRole("heading", {
      name: "Google Gemini TTS",
      exact: true,
    }),
  });
  await form.getByLabel("API key").fill(randomBytes(24).toString("hex"));
  await form
    .getByRole("button", { name: "Save Google Gemini TTS", exact: true })
    .click();
  await expect(
    form.getByText("Key saved · never returned to the browser"),
  ).toBeVisible();
  await expect(form.getByLabel("API key")).toHaveValue("");
  await page.getByLabel("Speech provider").selectOption("gemini");
  await page.getByRole("button", { name: "Save provider choices" }).click();
  await expect(
    page.getByText("Provider choices saved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Local compute").locator('option[value="gpu"]'),
  ).toHaveAttribute("disabled", "");
  await form.getByRole("button", { name: "Delete key", exact: true }).click();
  await expect(page.getByLabel("Speech provider")).toHaveValue("local");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "/workspace/BENAI-output/v3-provider-settings.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/videos");
  await expect(page.getByLabel("Export quality")).toHaveValue("fast");
  await expect(
    page.getByLabel("Video compute mode").locator('option[value="gpu"]'),
  ).toHaveAttribute("disabled", "");
});
test("template to public demo to consented lead and referral signup works in the browser", async ({
  page,
  browser,
}) => {
  const email = "growth-" + randomBytes(4).toString("hex") + "@browser.benai";
  await signup(page, email);
  await page.goto("/growth");
  const templates = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Start from a useful template" }),
  });
  await templates.getByLabel("Assistant name").fill("Sunrise cafe guide");
  await templates
    .getByLabel("Business facts & contact details")
    .fill(
      "Sunrise Cafe opens every day at 9am and closes at 5pm. Coffee costs five dollars. Contact hello@sunrisecafe.example for bookings.",
    );
  await templates.getByRole("button", { name: "Create assistant" }).click();
  await expect(page).toHaveURL(/studio\?avatar=/);
  await page.goto("/growth");
  const publish = page;
  await publish
    .getByRole("combobox", { name: "Demo assistant", exact: true })
    .selectOption({ label: "Sunrise cafe guide" });
  await publish.getByLabel("Title", { exact: true }).fill("Meet Sunrise Cafe");
  await publish
    .getByLabel("Description", { exact: true })
    .fill("Ask about our coffee and hours");
  await publish.getByRole("checkbox").check();
  await publish
    .getByRole("button", { name: "Publish demo", exact: true })
    .click();
  const link = page.getByRole("link", { name: "Open shareable demo" });
  await expect(link).toBeVisible();
  const path = await link.getAttribute("href");
  const context = await browser.newContext(),
    visitor = await context.newPage();
  await visitor.goto("http://127.0.0.1:3130" + path);
  await expect(
    visitor.getByRole("heading", { name: "Meet Sunrise Cafe" }),
  ).toBeVisible();
  await visitor
    .getByLabel("Your message")
    .fill("What time does Sunrise Cafe open?");
  await visitor
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(visitor.locator(".demo-messages")).toContainText(/9|nine/i);
  await visitor.getByLabel("Name", { exact: true }).fill("Interested customer");
  await visitor
    .getByLabel("Email", { exact: true })
    .fill("visitor@browser.benai");
  await visitor
    .getByLabel("Message", { exact: true })
    .fill("Please contact me about a booking");
  await visitor.getByRole("checkbox").check();
  await visitor.getByRole("button", { name: "Send enquiry" }).click();
  await expect(
    visitor.getByText("Your details were sent to the demo owner."),
  ).toBeVisible();
  await visitor
    .getByRole("link", { name: "Create your own free BENAI assistant" })
    .click();
  await visitor.getByLabel("Your name").fill("Referred creator");
  await visitor
    .getByLabel("Email address")
    .fill("referred-" + randomBytes(4).toString("hex") + "@browser.benai");
  await visitor.getByLabel("Password", { exact: true }).fill(password);
  await visitor.getByRole("button", { name: "Create free account" }).click();
  await expect(visitor).toHaveURL(/overview/);
  await page.goto("/growth");
  await expect(
    page.getByText("visitor@browser.benai", { exact: true }),
  ).toBeVisible();
  const referred = page
    .locator(".growth-stats .panel")
    .filter({ hasText: "referred signups" });
  await expect(referred.locator("strong")).toHaveText("1");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "/workspace/BENAI-output/v3-growth-dashboard.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Revoke demo" }).click();
  await visitor.goto("http://127.0.0.1:3130" + path);
  await expect(visitor.getByRole("alert")).toContainText("Demo not found");
  await context.close();
});
test("email verification and password recovery consume real one-use links through the UI", async ({
  page,
}) => {
  const email = "recovery-" + randomBytes(4).toString("hex") + "@browser.benai";
  await signup(page, email);
  await page.goto("/account");
  await expect(
    page.getByText("Email: not verified", { exact: true }),
  ).toBeVisible();
  function token(type) {
    const messages = readdirSync(process.env.BENAI_E2E_MAIL_DIR).map((n) =>
      JSON.parse(readFileSync(join(process.env.BENAI_E2E_MAIL_DIR, n))),
    );
    return messages
      .filter((m) => m.to === email && m.subject.includes(type))
      .at(-1)
      .text.match(/token=([a-f0-9]{64})/)[1];
  }
  await page.goto("/verify-email?token=" + token("Verify"));
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByText("Email verified.", { exact: true }),
  ).toBeVisible();
  await page.goto("/account");
  await expect(
    page.getByText("Email: verified", { exact: true }),
  ).toBeVisible();
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "If that account exists" }),
  ).toBeVisible();
  const reset = token("Reset"),
    nextPassword = randomBytes(16).toString("hex");
  await page.goto("/reset-password?token=" + reset);
  await page.getByLabel("New password").fill(nextPassword);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText(
      "Password reset. Existing sessions and API keys were revoked. Sign in again.",
    ),
  ).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/overview/);
});
test("administrator operations screen shows actual worker status", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("admin@e2e.benai");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/overview/);
  await page.goto("/operations");
  await expect(
    page.getByRole("heading", { name: "Service operations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "speech", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("ready · cpu", { exact: true })).toHaveCount(1);
  await expect(page.getByText("ready · —", { exact: true })).toHaveCount(2);
  await expect(
    page.getByText("not_configured · —", { exact: true }),
  ).toBeVisible();
});
