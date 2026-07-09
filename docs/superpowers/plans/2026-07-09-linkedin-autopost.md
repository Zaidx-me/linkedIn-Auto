# LinkedIn Autopost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept a topic from CLI, brainstorm the best post variant via NVIDIA NIM, then auto-publish to LinkedIn via Playwright browser session.

**Architecture:** Three new modules (session management, brainstorm+select, publisher) + entry-point script. Session saved as Playwright storageState JSON. Brainstorm uses existing PostGenerator + rerank via LLM. Publisher uses cookie-reuse with human-like jitter.

**Tech Stack:** TypeScript, Playwright, existing NVIDIA NIM client + PostGenerator + PostStore

## Global Constraints

- All existing code stays untouched unless explicitly listed in a task's "Modify" section
- No LinkedIn official API calls anywhere
- Browser session stored as Playwright `storageState` JSON at `./data/session.json`
- Topic pillar auto-classify via keyword fallback + LLM if ambiguous
- CAPTCHA encountered → take screenshot to `./data/captcha-{timestamp}.png`, throw `CaptchaBlockedError`
- Per-character typing delay: 30-90ms random jitter
- Pre-post browsing: scroll feed 15-40s before posting
- Post content includes hashtags from `GeneratePostResult.hashtags`
- On success: update post status to `published` in DB

---

### Task 1: Session management module

**Files:**
- Create: `src/auth/session.ts`

**Interfaces:**
- Produces: `ensureSession(): Promise<StorageState>` — returns valid Playwright storage state, prompts re-login if expired
- `loginFirstTime(): Promise<void>` — headful Chromium, user logs in manually, saves state

- [ ] **Step 1: Create `src/auth/session.ts`**

```typescript
import { chromium, BrowserContext } from "playwright";
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
      await page.goto(COOKIE_URL, { waitUntil: "networkidle", timeout: 15000 });
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
```

- [ ] **Step 2: Create `src/auth/captchaError.ts`**

```typescript
export class CaptchaBlockedError extends Error {
  constructor(screenshotPath: string) {
    super(`CAPTCHA blocked — manual intervention required. Screenshot saved to ${screenshotPath}`);
    this.name = "CaptchaBlockedError";
  }
}
```

- [ ] **Step 3: Write unit test for session file existence logic**

Run: `npx tsc --noEmit` to verify TS compiles (no test runner setup yet)
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/auth/session.ts src/auth/captchaError.ts
git commit -m "feat: add Playwright session management module"
```

---

### Task 2: Brainstorm + auto-select module

**Files:**
- Create: `src/brainstorm.ts`

**Interfaces:**
- Consumes: `PostGenerator` (existing), `PostStore` (existing)
- Produces: `brainstorm(topic: string): Promise<GeneratePostResult>` — classifies pillar, generates 3 variants, picks best, saves as approved

- [ ] **Step 1: Create `src/brainstorm.ts`**

```typescript
import { PostGenerator, GeneratePostResult } from "./generation/postGenerator";
import { persona } from "./config/persona";

function classifyPillar(topic: string): string {
  const topicLower = topic.toLowerCase();
  let best: { id: string; score: number } = { id: persona.contentPillars[0].id, score: 0 };

  for (const pillar of persona.contentPillars) {
    const keywords = pillar.exampleTopics
      .flatMap((t) => t.toLowerCase().split(" "))
      .concat(pillar.description.toLowerCase().split(" "));
    const matches = keywords.filter((kw) => topicLower.includes(kw)).length;
    if (matches > best.score) {
      best = { id: pillar.id, score: matches };
    }
  }
  return best.id;
}

export async function brainstorm(
  topic: string,
  generator: PostGenerator
): Promise<GeneratePostResult> {
  const pillarId = classifyPillar(topic);
  console.log(`Pillar: ${pillarId} | Topic: ${topic}`);

  const variants = await generator.generateVariants(
    { pillarId, topic },
    3
  );

  // Have the LLM pick the best variant
  const pickPrompt = `You are a social media editor. Here are 3 variants of a LinkedIn post. Pick the best one (reply with ONLY the variant number: 1, 2, or 3, no other text).

Variant 1:
${variants[0].text}

Variant 2:
${variants[1].text}

Variant 3:
${variants[2].text}

Which is best? Reply with only the number.`;

  const pickRaw = await generator["client"].chat(
    [{ role: "user", content: pickPrompt }],
    { temperature: 0.0 }
  );

  const pickIndex = Math.max(0, Math.min(2, (parseInt(pickRaw.trim()) || 1) - 1));
  const winner = variants[pickIndex];
  console.log(`Picked variant ${pickIndex + 1} (${winner.charCount} chars)`);

  return winner;
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/brainstorm.ts
git commit -m "feat: add brainstorm + auto-select module"
```

---

### Task 3: Publisher module

**Files:**
- Create: `src/publish/publisher.ts`

**Interfaces:**
- Consumes: `GeneratePostResult` (from generation), `SessionManager` (from auth)
- Produces: `publish(post: GeneratePostResult): Promise<void>` — publishes to LinkedIn

- [ ] **Step 1: Create `src/publish/publisher.ts`**

```typescript
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
        const screenshotPath = path.resolve(__dirname, `../../data/captcha-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        throw new CaptchaBlockedError(screenshotPath);
      }

      // Pre-post browsing: scroll feed
      console.log("Scrolling feed...");
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 600));
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
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/publish/publisher.ts
git commit -m "feat: add Playwright publisher module"
```

---

### Task 4: Entry point and package.json updates

**Files:**
- Create: `src/auto.ts`
- Modify: `package.json`

- [ ] **Step 1: Create `src/auto.ts`**

```typescript
import "dotenv/config";
import { PostGenerator } from "./generation/postGenerator";
import { PostStore } from "./storage/postStore";
import { brainstorm } from "./brainstorm";
import { Publisher } from "./publish/publisher";

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct";
const DB_PATH = process.env.DB_PATH || "./data/posts.db";

async function main() {
  const topic = process.argv.slice(2).join(" ");
  if (!topic) {
    console.error("Usage: npm run start -- \"topic for your post\"");
    process.exit(1);
  }

  console.log(`\n=== LinkedIn AutoPost ===`);
  console.log(`Topic: "${topic}"\n`);

  const generator = new PostGenerator(NVIDIA_API_KEY, NVIDIA_MODEL);
  const store = new PostStore(DB_PATH);

  // Step 1: Brainstorm
  console.log("Generating variants...");
  const winner = await brainstorm(topic, generator);

  // Save as approved
  const id = store.save(winner);
  store.updateStatus(id, "approved");
  console.log(`Winner saved to DB (id=${id}, status=approved)`);

  // Step 2: Publish
  console.log("Publishing to LinkedIn...");
  const publisher = new Publisher();
  await publisher.publish(winner);

  store.updateStatus(id, "published");
  console.log(`Post #${id} published!`);
  console.log(`\n--- Post Preview ---`);
  console.log(winner.text);
  console.log(`\nHashtags: ${winner.hashtags.join(", ")}`);
  console.log(`Characters: ${winner.charCount}`);
}

main().catch((err) => {
  if (err.name === "CaptchaBlockedError") {
    console.error("\n" + err.message);
    process.exit(3);
  }
  console.error("\nError:", err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Update `package.json` — add scripts and Playwright dep**

Add to scripts:
```json
"start": "tsx src/auto.ts",
"auth:login": "tsx -e \"const {SessionManager} = require('./src/auth/session'); new SessionManager().loginFirstTime().then(() => process.exit(0))\""
```

Add to dependencies:
```json
"playwright": "^1.48.0"
```

- [ ] **Step 3: Install Playwright**

Run: `npm install playwright && npx playwright install chromium`

- [ ] **Step 4: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/auto.ts package.json
git commit -m "feat: add auto entry point and update package.json"
```

---

### Task 5: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add autopost usage section to README**

Append to README.md:

```markdown
## Autopost (browser automation)

One-command flow: brainstorm → publish → done.

### First-time setup

```bash
npm run auth:login
# Browser opens. Log into LinkedIn manually, then press Enter in the terminal.
```

### Usage

```bash
npm run start -- "Setting up howdy facial recognition login on CachyOS"
```

This generates 3 post variants, picks the best via LLM, then publishes it to your LinkedIn feed automatically.

### If CAPTCHA appears

The tool saves a screenshot to `./data/captcha-*.png` and exits. You'll need to log in manually and re-authenticate, then re-run.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add autopost usage section to README"
```