import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import readline from "readline";
import { CaptchaBlockedError } from "./captchaError";

const DATA_DIR = path.resolve(process.cwd(), "data");
const PROFILE_DIR = path.resolve(DATA_DIR, "chrome_profile");
const COOKIE_CHECK_URL = "https://www.linkedin.com/feed";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function getCredentials(): { email: string; password: string } {
  const email = process.env.LINKEDIN_EMAIL;
  const password = process.env.LINKEDIN_PASSWORD;
  if (!email || !password) {
    throw new Error("LINKEDIN_EMAIL and LINKEDIN_PASSWORD must be set in environment");
  }
  return { email, password };
}

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

    const { email, password } = getCredentials();
    await this.loginWithCredentials(email, password);
  }

  private async loginWithCredentials(email: string, password: string): Promise<void> {
    console.log("  Logging in to LinkedIn...");
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      userAgent: USER_AGENT,
      viewport: { width: 1920, height: 1080 },
      args: ["--disable-blink-features=AutomationControlled"],
    });
    const page = await context.newPage();

    try {
      await page.goto("https://www.linkedin.com/login", { waitUntil: "load", timeout: 60000 });
      await page.waitForTimeout(2000);

      await page.fill("#username", email);
      await page.fill("#password", password);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      const url = page.url();
      if (url.includes("checkpoint") || url.includes("challenge")) {
        console.log("  LinkedIn requires verification. Complete it in the browser window,");
        console.log("  then press Enter here to continue.\n");
        const readline = (await import("readline")).default;
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise<void>((resolve) => rl.question("    Press Enter after verification... ", () => resolve()));
        rl.close();
        await page.waitForTimeout(3000);
      }
      if (page.url().includes("/login") || page.url().includes("authwall")) {
        throw new Error("Login failed — check LINKEDIN_EMAIL and LINKEDIN_PASSWORD");
      }
    } finally {
      await context.close();
    }
    console.log("  Login successful.\n");
  }

  private async sessionValid(): Promise<boolean> {
    try {
      const context = await chromium.launchPersistentContext(PROFILE_DIR, {
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
        const { email, password } = getCredentials();
        console.log("[publisher] Session expired, logging in with credentials...");
        await page.goto("https://www.linkedin.com/login", { waitUntil: "load", timeout: 60000 });
        await page.waitForTimeout(2000);
        await page.fill("#username", email);
        await page.fill("#password", password);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(5000);

        const afterLogin = page.url();
        if (afterLogin.includes("checkpoint") || afterLogin.includes("challenge")) {
          const screenshotPath = path.join(DATA_DIR, `challenge-${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath });
          throw new CaptchaBlockedError(screenshotPath);
        }
        if (afterLogin.includes("/login") || afterLogin.includes("authwall")) {
          throw new Error("Login failed — check LINKEDIN_EMAIL and LINKEDIN_PASSWORD");
        }
        console.log("[publisher] Re-authenticated with credentials");
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
