import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const SESSION_PATH = path.resolve(__dirname, "../../data/session.json");
const COOKIE_CHECK_URL = "https://www.linkedin.com/feed";

export class SessionManager {
  private ensureDir() {
    const dir = path.dirname(SESSION_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  async loginFirstTime(): Promise<void> {
    this.ensureDir();
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle" });
    console.log("\nPlease log in to LinkedIn in the browser window.");
    console.log("Press Enter here once login is complete...\n");
    await new Promise<void>((resolve) => {
      process.stdin.once("data", () => resolve());
    });
    await page.context().storageState({ path: SESSION_PATH });
    await browser.close();
    console.log("Session saved to", SESSION_PATH);
  }

  async ensureSession(): Promise<string> {
    if (!fs.existsSync(SESSION_PATH)) {
      console.log("No saved session found. Starting first-time login...");
      await this.loginFirstTime();
      return SESSION_PATH;
    }
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: SESSION_PATH });
    const page = await context.newPage();
    try {
      await page.goto(COOKIE_CHECK_URL, { waitUntil: "networkidle", timeout: 15000 });
      if (page.url().includes("/login") || page.url().includes("authwall")) {
        throw new Error("Session expired");
      }
    } catch {
      console.log("Session expired or invalid. Re-login required.");
      await browser.close();
      await this.loginFirstTime();
      return SESSION_PATH;
    }
    await browser.close();
    return SESSION_PATH;
  }
}