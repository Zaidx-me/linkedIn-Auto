import { chromium } from "playwright";
import { GeneratePostResult } from "../generation/postGenerator";
import { SessionManager } from "../auth/session";
import { CaptchaBlockedError } from "../auth/captchaError";
import fs from "fs";
import path from "path";

function randomDelay(min = 30, max = 90): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class Publisher {
  private session: SessionManager;

  constructor() {
    this.session = new SessionManager();
  }

  async publish(post: GeneratePostResult): Promise<void> {
    const sessionPath = await this.session.ensureSession();

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: sessionPath });
    const page = await context.newPage();

    try {
      await page.goto("https://www.linkedin.com/feed", { waitUntil: "networkidle", timeout: 20000 });

      // Check for CAPTCHA or auth wall
      const pageUrl = page.url();
      if (pageUrl.includes("/login") || pageUrl.includes("authwall") || pageUrl.includes("checkpoint")) {
        const dataDir = path.resolve(__dirname, "../../data");
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const screenshotPath = path.resolve(dataDir, `captcha-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        throw new CaptchaBlockedError(screenshotPath);
      }

      // Pre-post browsing: scroll feed
      console.log("Scrolling feed...");
      for (let i = 0; i < 3; i++) {
        await page.evaluate("window.scrollBy(0, 600)");
        await new Promise((r) => setTimeout(r, 3000 + Math.random() * 5000));
      }
      await new Promise((r) => setTimeout(r, 5000 + Math.random() * 10000));

      // Click "Start a post" button
      const startPostBtn = page.locator('button:has-text("Start a post")');
      await startPostBtn.waitFor({ state: "visible", timeout: 10000 });
      await startPostBtn.click();
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));

      // Find the editor and type
      const editor = page.locator('[role="textbox"]');
      await editor.waitFor({ state: "visible", timeout: 10000 });
      await editor.click();

      const text = post.text;
      for (let i = 0; i < text.length; i++) {
        await editor.type(text[i], { delay: randomDelay(30, 90) });
      }

      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));

      // Click Post
      const postBtn = page.locator('button:has-text("Post")');
      await postBtn.click();

      // Wait for post confirmation
      await page.waitForTimeout(5000);

      console.log("Post published successfully!");
    } catch (err) {
      if (err instanceof CaptchaBlockedError) throw err;
      console.error("Publish error:", err);
      throw err;
    } finally {
      await browser.close();
    }
  }
}
