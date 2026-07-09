import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { GeneratePostResult } from "../generation/postGenerator";
import { SessionManager } from "../auth/session";
import { CaptchaBlockedError } from "../auth/captchaError";

const DATA_DIR = path.resolve(process.cwd(), "data");
const PROFILE_DIR = path.resolve(DATA_DIR, "chrome_profile");
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/usr/bin/chromium";

export class Publisher {
  private session: SessionManager;

  constructor() {
    this.session = new SessionManager();
    if (!fs.existsSync(CHROMIUM_PATH)) {
      console.warn(`[publisher] WARNING: Chromium not found at ${CHROMIUM_PATH}. Set CHROMIUM_PATH in .env or ensure it's installed.`);
    }
  }

  async publish(post: GeneratePostResult): Promise<void> {
    console.log("[publisher] Ensuring session...");
    await this.session.ensureSession();

    console.log("[publisher] Launching browser...");
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      executablePath: CHROMIUM_PATH,
      headless: false,
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });
    await context.addInitScript(
      "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
    );
    const page = await context.newPage();

    try {
      console.log("[publisher] Navigating to linkedin.com/feed...");
      await page.goto("https://www.linkedin.com/feed", { waitUntil: "domcontentloaded", timeout: 60000 });

      const pageUrl = page.url();
      console.log(`[publisher] URL after load: ${pageUrl}`);
      if (pageUrl.includes("/login") || pageUrl.includes("authwall") || pageUrl.includes("checkpoint")) {
        const screenshotPath = path.join(DATA_DIR, `captcha-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        throw new CaptchaBlockedError(screenshotPath);
      }

      console.log("[publisher] Waiting for feed to settle...");
      await page.waitForTimeout(5000);

      console.log('[publisher] Clicking "Start a post"...');
      const startPostBtn = page.locator('a:has-text("Start a post")').first();
      await startPostBtn.waitFor({ state: "visible", timeout: 30000 });
      await startPostBtn.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(DATA_DIR, "debug-after-click-start-post.png") });
      console.log("[publisher] Screenshot saved: debug-after-click-start-post.png");

      console.log("[publisher] Looking for editor...");
      const editor = page.locator('[role="textbox"][aria-label*="Post"]').first();
      await editor.waitFor({ state: "visible", timeout: 30000 });
      await editor.click();
      await page.waitForTimeout(500);

      console.log("[publisher] Typing post text...");
      await editor.fill("");
      await page.keyboard.type(post.text, { delay: 10 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(DATA_DIR, "debug-after-typing.png") });
      console.log("[publisher] Screenshot saved: debug-after-typing.png");

      console.log("[publisher] Looking for Post button...");
      await page.waitForTimeout(2000);

      const postBtn = page.locator('button:has-text("Post")').last();
      await postBtn.waitFor({ state: "visible", timeout: 15000 });
      const postBtnBox = await postBtn.boundingBox();
      console.log(`[publisher] Post button found at x=${postBtnBox?.x} y=${postBtnBox?.y} w=${postBtnBox?.width} h=${postBtnBox?.height}`);
      await postBtn.click();

      console.log("[publisher] Waiting for post to go through...");
      await page.waitForTimeout(3000);

      const postUrl = page.url();
      console.log(`[publisher] URL after clicking Post: ${postUrl}`);

      await page.screenshot({ path: path.join(DATA_DIR, "debug-after-post.png") });
      console.log("[publisher] Screenshot saved: debug-after-post.png");

      console.log("\n✅ POST PUBLISHED SUCCESSFULLY TO LINKEDIN\n");
    } catch (err) {
      try {
        await page.screenshot({ path: path.join(DATA_DIR, `debug-error-${Date.now()}.png`) });
        console.log(`[publisher] Error screenshot saved`);
      } catch {}
      if (err instanceof CaptchaBlockedError) throw err;
      console.error("Publish error:", err);
      throw err;
    } finally {
      await context.close();
    }
  }
}