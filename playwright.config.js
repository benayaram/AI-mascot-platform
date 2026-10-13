import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
process.env.BENAI_E2E_PASSWORD ||= randomBytes(16).toString("hex");
export default defineConfig({
  testDir: "tests/browser",
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3130",
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        ...(process.env.BENAI_TEST_AUDIO
          ? [
              "--use-fake-device-for-media-stream",
              "--use-file-for-fake-audio-capture=" +
                process.env.BENAI_TEST_AUDIO,
            ]
          : []),
      ],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server/index.js",
    url: "http://127.0.0.1:3130/api/health",
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      PORT: "3130",
      APP_URL: "http://127.0.0.1:3130",
      DATA_DIR: mkdtempSync(join(tmpdir(), "benai-e2e-")),
      DEMO_MODE: "false",
      LOCAL_AI_URL: "http://127.0.0.1:8081/v1",
      LOCAL_SPEECH_URL: "http://127.0.0.1:8082",
      LOCAL_IMAGE_URL: "",
      MONGODB_URI: "",
      ADMIN_EMAIL: "admin@e2e.benai",
      ADMIN_PASSWORD: process.env.BENAI_E2E_PASSWORD,
      STRIPE_SECRET_KEY: "",
      AI_PROVIDER_KEY: "",
      OPENAI_API_KEY: "",
    },
  },
});
