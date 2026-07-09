import "dotenv/config";
import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { PostGenerator } from "./generation/postGenerator";
import { PostStore } from "./storage/postStore";
import { persona } from "./config/persona";
import { Publisher } from "./publish/publisher";
import { CaptchaBlockedError } from "./auth/captchaError";
import { GeneratePostResult } from "./generation/postGenerator";

const PORT = Number(process.env.PORT || 4000);
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct";
const DB_PATH = process.env.DB_PATH || "./data/posts.db";

const app = express();
app.use(express.json());
const publicDir = fs.existsSync(path.join(__dirname, "public"))
  ? path.join(__dirname, "public")
  : path.join(__dirname, "..", "src", "public");
app.use(express.static(publicDir));

app.use((req: Request, _res: Response, next) => {
  const start = Date.now();
  _res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[${req.method}] ${req.originalUrl} → ${_res.statusCode} (${ms}ms)`);
  });
  next();
});

const generator = new PostGenerator(NVIDIA_API_KEY, NVIDIA_MODEL);
const store = new PostStore(DB_PATH);

// --- Schemas -----------------------------------------------------------

const generateSchema = z.object({
  pillarId: z.string(),
  topic: z.string().min(3),
  extraContext: z.string().optional(),
  variants: z.number().int().min(1).max(5).optional(),
});

// --- Routes --------------------------------------------------------------

/** List available content pillars — useful for building a UI dropdown. */
app.get("/pillars", (_req: Request, res: Response) => {
  res.json(persona.contentPillars);
});

/** Generate one or more post variants and store them as pending_review. */
app.post("/generate", async (req: Request, res: Response) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { pillarId, topic, extraContext, variants } = parsed.data;

  try {
    console.log(`[generate] pillar=${pillarId} topic="${topic}" variants=${variants || 1}`);
    const results = variants
      ? await generator.generateVariants({ pillarId, topic, extraContext }, variants)
      : [await generator.generate({ pillarId, topic, extraContext })];

    const stored = results.map((r) => ({ id: store.savePost(r), ...r }));
    console.log(`[generate] → ${stored.length} post(s) saved (ids: ${stored.map(s => s.id).join(",")})`);
    res.json({ posts: stored });
  } catch (err: any) {
    console.error(`[generate] ERROR: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/** List posts awaiting approval. */
app.get("/queue", (_req: Request, res: Response) => {
  res.json(store.listByStatus("pending_review"));
});

/** Approve a post — flips status so a separate publish step can pick it up. */
app.post("/queue/:id/approve", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const post = store.getById(id);
  if (!post) return res.status(404).json({ error: "Post not found" });
  store.updateStatus(id, "approved");
  console.log(`[approve] post #${id} — "${post.topic}"`);
  res.json({ ok: true, id, status: "approved" });
});

/** Reject a post. */
app.post("/queue/:id/reject", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const post = store.getById(id);
  if (!post) return res.status(404).json({ error: "Post not found" });
  store.updateStatus(id, "rejected");
  console.log(`[reject] post #${id} — "${post.topic}"`);
  res.json({ ok: true, id, status: "rejected" });
});

/** Publish an approved post to LinkedIn via Playwright. */
app.post("/queue/:id/publish", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const post = store.getById(id);
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.status !== "approved") return res.status(400).json({ error: "Post must be approved before publishing" });
  console.log(`[publish] post #${id} — "${post.topic}"`);

  const publishPost: GeneratePostResult = {
    text: post.text,
    charCount: post.charCount,
    hashtags: JSON.parse(post.hashtags || "[]"),
    withinLimit: true,
    warnings: [],
    pillarId: post.pillarId,
    topic: post.topic,
    model: post.model,
    generatedAt: post.generatedAt,
  };

  const publisher = new Publisher();
  try {
    await publisher.publish(publishPost);
    store.updateStatus(id, "published");
    console.log(`[publish] post #${id} published successfully`);
    res.json({ ok: true, id, status: "published" });
  } catch (err: any) {
    if (err instanceof CaptchaBlockedError) {
      console.error(`[publish] CAPTCHA blocked for post #${id}`);
      return res.status(400).json({ error: err.message });
    }
    console.error(`[publish] ERROR for post #${id}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/** Approved but not yet published. */
app.get("/approved", (_req: Request, res: Response) => {
  res.json(store.listByStatus("approved"));
});

/** Published posts. */
app.get("/published", (_req: Request, res: Response) => {
  res.json(store.listByStatus("published"));
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, model: NVIDIA_MODEL });
});

app.get("*", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

async function start() {
  await store.init();
  app.listen(PORT, () => {
    console.log(`\n  🚀  linkedin-content-gen ready at http://localhost:${PORT}`);
    console.log(`  🤖  Model: ${NVIDIA_MODEL}`);
    if (!NVIDIA_API_KEY) {
      console.warn("\n  ⚠️  NVIDIA_API_KEY is not set — /generate will fail until you set it in .env\n");
    }
    console.log("  ─────────────────────────────────────────────\n");
  });
}

start();
