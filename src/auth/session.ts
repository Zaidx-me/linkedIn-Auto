import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import readline from "readline";
import { CaptchaBlockedError } from "./captchaError";

const DATA_DIR = path.resolve(process.cwd(), "data");
const PROFILE_DIR = path.resolve(DATA_DIR, "chrome_profile");
const COOKIE_CHECK_URL = "https://www.linkedin.com/feed";

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export class SessionManager {
  async ensureSession(): Promise<void> {
    if (fs.existsSync(PROFILE_DIR) && (await this.sessionValid())) {
      return;
    }

    if (fs.existsSync(PROFILE_DIR)) {
      console.log("  Saved session expired. Re-authenticating...\n");
      fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(PROFILE_DIR, { recursive: true });

    console.log("  Log into LinkedIn in the browser window, then come back here.\n");

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      executablePath: CHROMIUM_PATH,
      headless: false,
      userAgent: USER_AGENT,
      viewport: { width: 1920, height: 1080 },
      args: ["--disable-blink-features=AutomationControlled"],
    });
    const page = await context.newPage();
    await page.goto("https://www.linkedin.com/login", { waitUntil: "load", timeout: 60000 });

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => rl.question("  Press Enter to continue... ", () => resolve()));
    rl.close();

    // Quick check — did login actually work?
    await page.goto("https://www.linkedin.com/feed", { waitUntil: "domcontentloaded", timeout: 15000 });
    if (page.url().includes("/login") || page.url().includes("authwall")) {
      await page.close();
      await context.close();
      fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
      throw new Error(
        "Session not recognized after login. " +
        "Make sure you complete any verification steps (email/SMS code) " +
        "before pressing Enter. Run again to try."
      );
    }

    await context.close();
    console.log("Profile saved.\n");
  }

  private async sessionValid(): Promise<boolean> {
    try {
      const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  executablePath: CHROMIUM_PATH,
        headless: true, userAgent: USER_AGENT, viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
      });
      await context.addInitScript(
        "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
      );
      const page = await context.newPage();
      await page.goto("https://www.linkedin.com/feed", { waitUntil: "domcontentloaded", timeout: 30000 });
      const ok = !page.url().includes("/login") && !page.url().includes("authwall");
      await context.close();
      return ok;
    } catch {
      return false;
    }
  }

  async validateSession(): Promise<void> {
    let context;
    try {
      context = await chromium.launchPersistentContext(PROFILE_DIR, {
  executablePath: CHROMIUM_PATH,
        headless: true,
        userAgent: USER_AGENT,
        viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
      });
      await context.addInitScript(
        "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
      );
      const page = await context.newPage();
      await page.goto(COOKIE_CHECK_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

      const url = page.url();
      if (url.includes("/login") || url.includes("authwall")) {
        throw new Error("Session expired");
      }
      if (url.includes("checkpoint") || url.includes("challenge")) {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        const screenshotPath = path.join(DATA_DIR, `captcha-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        throw new CaptchaBlockedError(screenshotPath);
      }
    } catch (err) {
      if (context) await context.close().catch(() => {});
      if (err instanceof CaptchaBlockedError) throw err;
      throw new Error(`Session invalid — run 'npm run auth:login' to re-authenticate.`);
    }
    await context.close();
  }
}
