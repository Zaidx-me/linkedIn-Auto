import "dotenv/config";
import fs from "fs";
import path from "path";
import { PostGenerator } from "../generation/postGenerator";
import { PostStore } from "../storage/postStore";
import { Publisher } from "../publish/publisher";
import { CaptchaBlockedError } from "../auth/captchaError";
import { loadCalendar, getDay, getNextTheme } from "../config/calendar";
import { getPostTypes, getNextPostType, PostType } from "../config/templates";
import { scorePost } from "../generation/postProcessor";

const DATA_DIR = process.cwd();
const PROGRESS_FILE = path.resolve(DATA_DIR, "data/schedule-progress.json");
const DB_PATH = process.env.DB_PATH || "./data/posts.db";
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct";

const TOTAL_DAYS = 30;
const POSTS_PER_DAY = 4;
const TOTAL_POSTS = TOTAL_DAYS * POSTS_PER_DAY; // 120
const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours between posts
const RETRY_INTERVAL_MS = 30 * 60 * 1000; // 30 min retry on error
const QUALITY_THRESHOLD = 6; // minimum score to accept a post
const MAX_RETRIES = 2; // additional retries if score too low

const POST_TYPES = getPostTypes(); // ["lesson", "example", "mistake", "challenge"]

interface Progress {
  dayIndex: number; // 0-29
  postTypeIndex: number; // 0-3
  lastPostTime: string | null;
  done: boolean;
}

const DEFAULT_PROGRESS: Progress = { dayIndex: 0, postTypeIndex: 0, lastPostTime: null, done: false };

function loadProgress(): Progress {
  const fallback = { ...DEFAULT_PROGRESS };
  if (!fs.existsSync(PROGRESS_FILE)) {
    return fallback;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
    if (typeof raw.dayIndex !== "number" || typeof raw.postTypeIndex !== "number") {
      console.warn(`[scheduler] Progress file has invalid fields, resetting to defaults`);
      return fallback;
    }
    return {
      dayIndex: raw.dayIndex,
      postTypeIndex: raw.postTypeIndex,
      lastPostTime: raw.lastPostTime ?? null,
      done: raw.done === true,
    };
  } catch (err: any) {
    console.warn(`[scheduler] Failed to parse progress file: ${err.message}. Using defaults.`);
    return fallback;
  }
}

function saveProgress(p: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postOnce(
  generator: PostGenerator,
  store: PostStore,
  publisher: Publisher,
  dayIndex: number,
  postTypeIndex: number
): Promise<boolean> {
  const calendarDay = getDay(dayIndex);
  const postType = POST_TYPES[postTypeIndex];
  const tomorrowTheme = getNextTheme(dayIndex);

  console.log(`\n[scheduler] Day ${calendarDay.day}/${TOTAL_DAYS} | Post ${postTypeIndex + 1}/${POSTS_PER_DAY} | Type: ${postType}`);
  console.log(`[scheduler] Theme: "${calendarDay.theme}"`);
  console.log(`[scheduler] Hook: "${calendarDay.hook}"`);

  // Generate 3 variants
  console.log("[scheduler] Generating 3 variants...");
  const variants = await generator.generateVariants(
    {
      topic: calendarDay.theme,
      hook: calendarDay.hook,
      postType,
      day: calendarDay.day,
      tomorrowTheme,
    },
    3
  );

  // Score each variant
  const scored = variants.map((v) => ({
    post: v,
    scoreResult: scorePost(v.text),
  }));

  scored.sort((a, b) => b.scoreResult.score - a.scoreResult.score);
  const best = scored[0];

  console.log(`[scheduler] Best variant score: ${best.scoreResult.score}/10`);
  console.log(`[scheduler] Reasons: ${best.scoreResult.reasons.join("; ")}`);

  // Quality gate: retry if score too low
  let finalPost = best.post;
  let finalScore = best.scoreResult.score;

  if (finalScore < QUALITY_THRESHOLD) {
    console.log(`[scheduler] Score ${finalScore} below threshold ${QUALITY_THRESHOLD}. Retrying...`);

    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      const retryTemp = 0.3 + retry * 0.2;
      console.log(`[scheduler] Retry ${retry + 1}/${MAX_RETRIES} at temp ${retryTemp}...`);

      const retryVariant = await generator.generate({
        topic: calendarDay.theme,
        hook: calendarDay.hook,
        postType,
        day: calendarDay.day,
        tomorrowTheme,
        temperature: retryTemp,
      });

      const retryScore = scorePost(retryVariant.text);
      console.log(`[scheduler] Retry score: ${retryScore.score}/10`);

      if (retryScore.score > finalScore) {
        finalPost = retryVariant;
        finalScore = retryScore.score;
        console.log(`[scheduler] Improved! New best: ${finalScore}/10`);
      }

      if (finalScore >= QUALITY_THRESHOLD) {
        console.log(`[scheduler] Quality gate passed at score ${finalScore}`);
        break;
      }
    }
  }

  // Save as approved
  const id = store.savePost(finalPost);
  store.updateStatus(id, "approved");
  console.log(`[scheduler] Post #${id} saved and approved (score: ${finalScore}/10)`);

  // Publish to LinkedIn
  console.log("[scheduler] Publishing to LinkedIn...");
  await publisher.publish(finalPost);
  store.updateStatus(id, "published");
  console.log(`[scheduler] Post #${id} published successfully`);

  return true;
}

let shutdownRequested = false;

function setupGracefulShutdown(store: PostStore) {
  const shutdown = (signal: string) => {
    console.log(`\n[scheduler] ${signal} received. Shutting down gracefully...`);
    shutdownRequested = true;
    try {
      store.close();
      console.log("[scheduler] Database closed.");
    } catch {}
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function main() {
  console.log("========================================");
  console.log("  LinkedIn Auto Scheduler");
  console.log(`  4 posts/day for ${TOTAL_DAYS} days (${TOTAL_POSTS} total)`);
  console.log(`  Spacing: ${INTERVAL_MS / (60 * 60 * 1000)}h between posts`);
  console.log(`  Quality threshold: ${QUALITY_THRESHOLD}/10`);
  console.log("========================================\n");

  console.log("[scheduler] Initializing...");

  // Validate calendar
  const calendar = loadCalendar();
  if (calendar.length < TOTAL_DAYS) {
    console.error(`[scheduler] Calendar has ${calendar.length} days, expected ${TOTAL_DAYS}`);
    process.exit(1);
  }
  console.log(`[scheduler] Loaded ${calendar.length} calendar days`);

  if (!NVIDIA_API_KEY) {
    console.error("[scheduler] NVIDIA_API_KEY is not set. Copy .env.example to .env and add your key.");
    process.exit(1);
  }
  console.log("[scheduler] NVIDIA API key configured");

  console.log("[scheduler] Creating PostGenerator...");
  const generator = new PostGenerator(NVIDIA_API_KEY, NVIDIA_MODEL);
  console.log("[scheduler] PostGenerator created");

  console.log("[scheduler] Creating PostStore...");
  const store = new PostStore(DB_PATH);
  console.log("[scheduler] Initializing database...");
  await store.init();
  console.log("[scheduler] Database initialized");

  setupGracefulShutdown(store);

  console.log("[scheduler] Creating Publisher...");
  const publisher = new Publisher();
  console.log("[scheduler] Publisher created");

  const progress = loadProgress();
  console.log(`[scheduler] Progress loaded: dayIndex=${progress.dayIndex}, postTypeIndex=${progress.postTypeIndex}`);

  if (progress.done) {
    console.log("[scheduler] Schedule already complete. Delete data/schedule-progress.json to restart.");
    return;
  }

  const completedPosts =
    (typeof progress.dayIndex === "number" ? progress.dayIndex : 0) * POSTS_PER_DAY +
    (typeof progress.postTypeIndex === "number" ? progress.postTypeIndex : 0);
  const remaining = TOTAL_POSTS - completedPosts;
  console.log(`[scheduler] ${Number.isFinite(remaining) ? remaining : TOTAL_POSTS} posts remaining\n`);

  while (progress.dayIndex < TOTAL_DAYS && !shutdownRequested) {
    try {
      await postOnce(generator, store, publisher, progress.dayIndex, progress.postTypeIndex);

      // Advance progress
      progress.postTypeIndex++;
      if (progress.postTypeIndex >= POSTS_PER_DAY) {
        progress.postTypeIndex = 0;
        progress.dayIndex++;
      }

      progress.lastPostTime = new Date().toISOString();
      saveProgress(progress);

      // Status
      const done = progress.dayIndex * POSTS_PER_DAY + progress.postTypeIndex;
      const currentDay = progress.dayIndex + 1;
      const dayPost = progress.postTypeIndex || POSTS_PER_DAY;
      console.log(`[scheduler] Progress: ${done}/${TOTAL_POSTS} (Day ${currentDay}/${TOTAL_DAYS}, post ${dayPost}/${POSTS_PER_DAY})`);

      // Check if all done
      if (progress.dayIndex >= TOTAL_DAYS) {
        progress.done = true;
        saveProgress(progress);
        console.log("\n[scheduler] All 120 posts published!");
        break;
      }
    } catch (err: any) {
      if (err instanceof CaptchaBlockedError) {
        console.error(`[scheduler] CAPTCHA blocked. Run 'npm run auth:login' then restart.`);
        process.exit(3);
      }
      console.error(`[scheduler] Failed: ${err.message}`);
      if (err.stack) console.error(`[scheduler] Stack: ${err.stack}`);
      console.error(`[scheduler] Retrying in ${RETRY_INTERVAL_MS / 60000} min...`);
      await sleep(RETRY_INTERVAL_MS);
      continue;
    }

    if (shutdownRequested) break;

    const nextPost = new Date(Date.now() + INTERVAL_MS);
    console.log(`[scheduler] Next post at ${nextPost.toLocaleString()}`);
    console.log(`[scheduler] Waiting ${INTERVAL_MS / (60 * 60 * 1000)}h...\n`);
    await sleep(INTERVAL_MS);
  }

  console.log("[scheduler] Scheduler loop ended.");
  try { store.close(); } catch {}
}

main().catch((err) => {
  console.error(`[scheduler] Fatal: ${err.message}`);
  if (err.stack) console.error(`[scheduler] Stack: ${err.stack}`);
  process.exit(1);
});
