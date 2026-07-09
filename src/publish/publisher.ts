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

const debugScreenshot = async (name: string) => {
        await page.screenshot({ path: path.join(DATA_DIR, `debug-${name}.png`), fullPage: false });
        console.log(`[publisher] Screenshot saved: debug-${name}.png`);
      };

      console.log('[publisher] Trying to open the share box...');
      const startPostBtn = page.locator('a:has-text("Start a post")').first();
      await startPostBtn.waitFor({ state: "visible", timeout: 30000 });
      await startPostBtn.click();
      await page.waitForTimeout(3000);
      await debugScreenshot("after-click-start-post");

      let editor = page.locator('[role="textbox"]').first();
      let editorVisible = false;
      try {
        await editor.waitFor({ state: "visible", timeout: 5000 });
        editorVisible = true;
      } catch {
        console.log("[publisher] Editor not found yet, trying share-box trigger...");
      }

      if (!editorVisible) {
        const shareBox = page.locator('.share-box__open, [data-embed-id*="share-box"]').first();
        if (await shareBox.isVisible()) {
          console.log("[publisher] Share box is open, clicking inner text area...");
          await shareBox.locator('[contenteditable="true"]').first().click();
          await page.waitForTimeout(1000);
          await debugScreenshot("after-sharebox-click");
          editor = page.locator('[contenteditable="true"]').first();
        } else {
          console.log("[publisher] Share box not found, trying keyboard shortcut 'n'...");
          await page.keyboard.press("n");
          await page.waitForTimeout(2000);
          await debugScreenshot("after-keyboard-n");
          editor = page.locator('[contenteditable="true"]').first();
        }
      }

      await editor.waitFor({ state: "visible", timeout: 20000 });
      await editor.click();
      await page.waitForTimeout(500);

      console.log("[publisher] Typing post text with character delay...");
      await editor.fill("");
      await page.waitForTimeout(200);
      await page.keyboard.type(post.text, { delay: 15 });
      await page.waitForTimeout(1500);
      await debugScreenshot("after-typing");

      await page.waitForTimeout(2000);

      console.log("[publisher] Looking for Post button...");
      const postBtn = page.locator('button:has-text("Post")').first();
      await postBtn.waitFor({ state: "visible", timeout: 15000 });
      const postBtnBox = await postBtn.boundingBox();
      console.log(`[publisher] Post button at x=${postBtnBox?.x} y=${postBtnBox?.y}`);
      await postBtn.click();

      console.log("[publisher] Waiting for post confirmation...");
      await page.waitForTimeout(5000);
      await debugScreenshot("after-post-click");

      const postUrl = page.url();
      console.log(`[publisher] URL after post click: ${postUrl}`);

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