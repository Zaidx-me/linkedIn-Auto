import "dotenv/config";
import fs from "fs";
import path from "path";
import { PostGenerator } from "../generation/postGenerator";
import { PostStore } from "../storage/postStore";
import { Publisher } from "../publish/publisher";
import { CaptchaBlockedError } from "../auth/captchaError";
import { brainstorm } from "../brainstorm";

const DATA_DIR = process.cwd();
const TOPICS_FILE = path.resolve(DATA_DIR, "data/topics.json");
const PROGRESS_FILE = path.resolve(DATA_DIR, "data/schedule-progress.json");
const DB_PATH = process.env.DB_PATH || "./data/posts.db";
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct";

const TOTAL_POSTS = 90;
const INTERVAL_MS = 8 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 30 * 60 * 1000;

interface Progress {
  topicIndex: number;
  postsRemaining: number;
  lastPostTime: string | null;
  done: boolean;
}

function loadTopics(): string[] {
  if (!fs.existsSync(TOPICS_FILE)) {
    console.error(`[scheduler] topics file not found at ${TOPICS_FILE}`);
    console.error(`[scheduler] Create data/topics.json with an array of topic strings`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(TOPICS_FILE, "utf-8"));
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
  }
  return { topicIndex: 0, postsRemaining: TOTAL_POSTS, lastPostTime: null, done: false };
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
  topic: string,
) {
  console.log(`\n[scheduler] Topic: "${topic}"`);
  console.log("[scheduler] Generating post...");
  const post = await brainstorm(topic, generator);
  console.log(`[scheduler] Generated (${post.charCount} chars)`);

  const id = store.savePost(post);
  store.updateStatus(id, "approved");
  console.log(`[scheduler] Post #${id} saved and approved`);

  console.log("[scheduler] Publishing to LinkedIn...");
  await publisher.publish(post);
  store.updateStatus(id, "published");
  console.log(`[scheduler] Post #${id} published successfully`);
}

async function main() {
  const days = Math.ceil(TOTAL_POSTS / 3);
  console.log("========================================");
  console.log("  LinkedIn Auto Scheduler");
  console.log(`  3 posts/day for ${days} days (${TOTAL_POSTS} total)`);
  console.log("========================================\n");

  const topics = loadTopics();
  console.log(`[scheduler] Loaded ${topics.length} topics`);

  const generator = new PostGenerator(NVIDIA_API_KEY, NVIDIA_MODEL);
  const store = new PostStore(DB_PATH);
  await store.init();
  const publisher = new Publisher();
  const progress = loadProgress();

  if (progress.done) {
    console.log("[scheduler] Schedule already complete. Delete data/schedule-progress.json to restart.");
    return;
  }

  console.log(`[scheduler] ${progress.postsRemaining} posts remaining\n`);

  while (progress.postsRemaining > 0) {
    if (progress.topicIndex >= topics.length) {
      console.log("[scheduler] All topics used — cycling from start");
      progress.topicIndex = 0;
    }

    const topic = topics[progress.topicIndex++];
    try {
      await postOnce(generator, store, publisher, topic);
      progress.postsRemaining--;
      progress.lastPostTime = new Date().toISOString();
      saveProgress(progress);

      const done = TOTAL_POSTS - progress.postsRemaining;
      const totalDays = Math.ceil(TOTAL_POSTS / 3);
      const currentDay = Math.ceil(done / 3);
      const dayPost = done % 3 || 3;
      console.log(`[scheduler] Post ${done}/${TOTAL_POSTS} (Day ${currentDay}/${totalDays}, post ${dayPost}/3)`);

      if (progress.postsRemaining <= 0) {
        progress.done = true;
        saveProgress(progress);
        console.log("\n[scheduler] ✅ All 90 posts published!");
        break;
      }
    } catch (err: any) {
      if (err instanceof CaptchaBlockedError) {
        console.error(`[scheduler] ❌ CAPTCHA blocked. Run 'npm run auth:login' then restart.`);
        process.exit(3);
      }
      console.error(`[scheduler] ❌ Failed: ${err.message}. Retrying in 30 min...`);
      progress.topicIndex--;
      await sleep(RETRY_INTERVAL_MS);
      continue;
    }

    const nextPost = new Date(Date.now() + INTERVAL_MS);
    console.log(`[scheduler] Next post at ${nextPost.toLocaleString()}`);
    console.log(`[scheduler] Waiting 8h...\n`);
    await sleep(INTERVAL_MS);
  }
}

main().catch((err) => {
  console.error(`[scheduler] Fatal: ${err.message}`);
  process.exit(1);
});
