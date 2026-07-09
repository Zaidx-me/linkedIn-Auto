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

      console.log('[publisher] Clicking "Start a post"...');
      const startPostBtn = page.locator('a:has-text("Start a post")').first();
      await startPostBtn.waitFor({ state: "visible", timeout: 30000 });
      await startPostBtn.click();
      await page.waitForTimeout(3000);
      await debugScreenshot("after-click-start-post");

      console.log("[publisher] Waiting for share dialog...");
      const shareDialog = page.locator('[role="dialog"]').filter({ hasText: "Post" }).first();
      await shareDialog.waitFor({ state: "visible", timeout: 20000 });
      console.log("[publisher] Share dialog visible");

      const editor = shareDialog.locator('[contenteditable="true"]').first();
      await editor.waitFor({ state: "visible", timeout: 10000 });
      await editor.click();
      await page.waitForTimeout(500);

      console.log("[publisher] Setting post content via innerHTML...");
      const lines = post.text.split("\n").map(l => l.trim() ? `<p>${l}</p>` : "<p><br></p>").join("");
      await editor.evaluate((el, html) => { (el as HTMLElement).innerHTML = html; }, lines);
      await page.waitForTimeout(500);

      editor.evaluate((el) => {
        el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.waitForTimeout(1500);
      await debugScreenshot("after-typing");

      console.log("[publisher] Waiting for Post button to become enabled...");
      let postBtn = shareDialog.locator('button:has-text("Post")').first();
      await postBtn.waitFor({ state: "attached", timeout: 15000 });

      let attempts = 0;
      const maxAttempts = 3;
      let posted = false;

      while (!posted && attempts < maxAttempts) {
        attempts++;
        await page.waitForTimeout(1000);

        const isDisabled = await postBtn.getAttribute("disabled");
        console.log(`[publisher] Attempt ${attempts}: Post button disabled attribute = ${isDisabled}`);

        if (isDisabled !== null) {
          await editor.evaluate((el) => {
            const html = (el as HTMLElement).innerHTML;
            (el as HTMLElement).innerHTML = html + " \n";
            el.dispatchEvent(new Event("input", { bubbles: true }));
          });
          await page.waitForTimeout(1000);
        }

        await postBtn.evaluate((btn) => (btn as HTMLButtonElement).click());
        console.log(`[publisher] Attempt ${attempts}: clicked Post button via native DOM`);
        await page.waitForTimeout(3000);

        const dialogStillOpen = await shareDialog.isVisible().catch(() => false);
        if (!dialogStillOpen) {
          posted = true;
          console.log("[publisher] Share dialog closed — post submitted successfully");
        } else {
          console.log(`[publisher] Dialog still open after attempt ${attempts}`);
          postBtn = shareDialog.locator('button:has-text("Post")').first();
        }
      }

      if (!posted) {
        console.log("[publisher] Trying force-click on any Post button in page...");
        await page.locator('button:has-text("Post")').last().click({ force: true });
        await page.waitForTimeout(3000);
      }

      await debugScreenshot("after-post-click");

      let published = posted;
      if (!published) {
        published = !(await shareDialog.isVisible().catch(() => false));
      }

      const toasts = await page.locator('[role="alert"], [data-test-id*="toast"], .artdeco-toast-item').all().catch(() => []);
      console.log(`[publisher] Toast messages found: ${toasts.length}`);
      for (const t of toasts) {
        console.log(`[publisher] Toast: ${await t.textContent().catch(() => "?")}`);
      }

      if (published) {
        console.log("\n✅ POST PUBLISHED SUCCESSFULLY TO LINKEDIN\n");
      } else {
        throw new Error("Post button clicked but dialog did not close — LinkedIn may have blocked the submission");
      }
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