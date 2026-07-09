import "dotenv/config";
import express, { Request, Response } from "express";
import path from "path";
import { z } from "zod";
import { PostGenerator } from "./generation/postGenerator";
import { PostStore } from "./storage/postStore";
import { persona } from "./config/persona";

const PORT = Number(process.env.PORT || 4000);
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct";
const DB_PATH = process.env.DB_PATH || "./data/posts.db";

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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
    const results = variants
      ? await generator.generateVariants({ pillarId, topic, extraContext }, variants)
      : [await generator.generate({ pillarId, topic, extraContext })];

    const stored = results.map((r) => ({ id: store.savePost(r), ...r }));
    res.json({ posts: stored });
  } catch (err: any) {
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
  res.json({ ok: true, id, status: "approved" });
});

/** Reject a post. */
app.post("/queue/:id/reject", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const post = store.getById(id);
  if (!post) return res.status(404).json({ error: "Post not found" });
  store.updateStatus(id, "rejected");
  res.json({ ok: true, id, status: "rejected" });
});

/** Approved posts, ready for whatever publish mechanism you wire up next. */
app.get("/approved", (_req: Request, res: Response) => {
  res.json(store.listByStatus("approved"));
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, model: NVIDIA_MODEL });
});

app.get("*", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  await store.init();
  app.listen(PORT, () => {
    console.log(`linkedin-content-gen listening on http://localhost:${PORT}`);
    console.log(`Model: ${NVIDIA_MODEL}`);
    if (!NVIDIA_API_KEY) {
      console.warn("WARNING: NVIDIA_API_KEY is not set — /generate will fail until you set it in .env");
    }
  });
}

start();
