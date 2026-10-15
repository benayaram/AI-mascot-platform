import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
test("institute editor saves a real lesson, previews graphics, and enforces mobile layout", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Institute teacher");
  await page
    .getByLabel("Email address")
    .fill("institute-" + randomBytes(4).toString("hex") + "@browser.benai");
  await page
    .getByLabel("Password", { exact: true })
    .fill(randomBytes(16).toString("hex"));
  await page.getByRole("button", { name: "Create free account" }).click();
  await expect(page).toHaveURL(/overview/);
  await page.getByRole("link", { name: "Institute lessons" }).click();
  await expect(
    page.getByRole("heading", { name: "Teach with a story." }),
  ).toBeVisible();
  await page
    .getByLabel("Lesson title", { exact: true })
    .fill("A browser-tested science lesson");
  await page.getByRole("button", { name: "Save lesson", exact: true }).click();
  await expect(page.getByText("Lesson saved", { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByLabel("Lesson library")
    .selectOption({ label: "A browser-tested science lesson · draft" });
  await expect(page.getByLabel("Lesson title", { exact: true })).toHaveValue(
    "A browser-tested science lesson",
  );
  await page
    .getByRole("button", { name: "Play video", exact: true })
    .first()
    .click();
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: "/workspace/BENAI-output/v4-institute-editor.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
});
test("private source editor persists document and saved conversation language", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Language teacher");
  await page
    .getByLabel("Email address")
    .fill("sources-" + randomBytes(4).toString("hex") + "@browser.benai");
  await page
    .getByLabel("Password", { exact: true })
    .fill(randomBytes(16).toString("hex"));
  await page.getByRole("button", { name: "Create free account" }).click();
  await expect(page).toHaveURL(/overview/);
  await page.goto("/knowledge");
  await page.getByLabel("Source name").fill("School hours");
  await page
    .getByLabel("Facts and reference text")
    .fill("School starts at 9 AM and ends at 4 PM on weekdays.");
  await page.getByRole("button", { name: "Save source", exact: true }).click();
  await expect(page.getByText("School hours", { exact: true })).toBeVisible();
  await page.goto("/ai-settings");
  await page.getByLabel("Conversation language").selectOption("te");
  await page.getByLabel("Speech provider").selectOption("espeak");
  await page.getByRole("button", { name: "Save provider choices" }).click();
  await expect(
    page.getByText("Provider choices saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Conversation language")).toHaveValue("te");
  await expect(page.getByLabel("Speech provider")).toHaveValue("espeak");
});
