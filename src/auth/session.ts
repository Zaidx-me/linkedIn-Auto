import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { CaptchaBlockedError } from "./captchaError";

const SESSION_PATH = path.resolve(__dirname, "../../data/session.json");
const COOKIE_CHECK_URL = "https://www.linkedin.com/feed";
const CAPTCHA_DIR = path.resolve(__dirname, "../../data");
const ESSENTIAL_COOKIES = ["li_at", "JSESSIONID"];

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export class SessionManager {
  private contextOptions() {
    return {
      userAgent: USER_AGENT,
      locale: "en-US",
      timezoneId: "America/New_York",
      viewport: { width: 1920, height: 1080 },
    };
  }

  /** Print instructions for the user to manually export cookies from their real browser. */
  private printManualInstructions(): void {
    console.log("\n  LinkedIn login via Playwright's browser gets blocked.");
    console.log("  Use your real browser instead:\n");
    console.log("  1. Open Chrome/Firefox and log into linkedin.com");
    console.log("  2. Install 'Get cookies.txt LOCALLY' extension:");
    console.log("     https://chromewebstore.google.com/detail/cclelndahbckbenkjhflpdbgdldlbecc");
    console.log("  3. Go to linkedin.com, click the extension icon, export cookies");
    console.log("  4. Save the file as data/cookies.txt in this project\n");
    console.log("  Then rerun the command. The tool will convert it automatically.\n");
  }

  /** Convert a Netscape-format cookies.txt to Playwright storageState. */
  private convertNetscapeToStorageState(filePath: string): void {
    const text = fs.readFileSync(filePath, "utf-8");
    const lines = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    const cookies: any[] = [];

    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length < 7) continue;
      const [domain, , path, secure, expires, name, value] = parts;
      cookies.push({
        name,
        value,
        domain,
        path: path || "/",
        expires: parseInt(expires) || -1,
        httpOnly: true,
        secure: secure === "TRUE",
        sameSite: "None",
      });
    }

    if (cookies.length > 0) {
      const names = cookies.map((c: any) => c.name);
      const missing = ESSENTIAL_COOKIES.filter((e) => !names.includes(e));
      fs.writeFileSync(SESSION_PATH, JSON.stringify({ cookies: cookies, origins: [] }, null, 2));
      console.log(`Converted ${cookies.length} cookies from cookies.txt to Playwright storageState.`);
      if (missing.length > 0) {
        console.warn(`  Missing essential cookies: ${missing.join(", ")}. Login will likely fail.`);
      }
    }
  }

  private async addStealth(context: any) {
    await context.addInitScript("Object.defineProperty(navigator, 'webdriver', { get: () => undefined });");
  }

  async ensureSession(): Promise<string> {
    if (!fs.existsSync(SESSION_PATH)) {
      const cookiesTxt = path.resolve(__dirname, "../../data/cookies.txt");
      if (fs.existsSync(cookiesTxt)) {
        this.convertNetscapeToStorageState(cookiesTxt);
      } else {
        this.printManualInstructions();
        console.log("Place the cookie file and rerun the command.\n");
        throw new Error("No session.json or cookies.txt found — see instructions above.");
      }
    }

    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-web-security",
        ],
      });
      const context = await browser.newContext({
        ...this.contextOptions(),
        storageState: SESSION_PATH,
      });
      await this.addStealth(context);
      const page = await context.newPage();
      // Visit root first so cookies are established, then go to feed
      await page.goto("https://www.linkedin.com", { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.goto(COOKIE_CHECK_URL, { waitUntil: "networkidle", timeout: 15000 });
      const url = page.url();
      if (url.includes("/login") || url.includes("authwall")) {
        throw new Error("Session expired");
      }
      if (url.includes("checkpoint") || url.includes("challenge")) {
        if (!fs.existsSync(CAPTCHA_DIR)) fs.mkdirSync(CAPTCHA_DIR, { recursive: true });
        const screenshotPath = path.join(CAPTCHA_DIR, `captcha-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        throw new CaptchaBlockedError(screenshotPath);
      }
      const captchaEl = await page.$('[data-test-id="captcha"], #captcha-internal');
      if (captchaEl) {
        if (!fs.existsSync(CAPTCHA_DIR)) fs.mkdirSync(CAPTCHA_DIR, { recursive: true });
        const screenshotPath = path.join(CAPTCHA_DIR, `captcha-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        throw new CaptchaBlockedError(screenshotPath);
      }
    } catch (err) {
      if (browser) await browser.close();
      if (err instanceof CaptchaBlockedError) throw err;
      console.log("Session expired or invalid. Export fresh cookies from your browser and try again.");
      throw new Error("Session invalid — re-export cookies from your browser to data/cookies.txt");
    }
    await browser.close();
    return SESSION_PATH;
  }
}