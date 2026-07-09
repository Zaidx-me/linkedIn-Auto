import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { GeneratePostResult } from "../generation/postGenerator";

export type PostStatus = "pending_review" | "approved" | "rejected" | "published";

export interface StoredPost {
  id: number;
  pillarId: string;
  topic: string;
  text: string;
  charCount: number;
  hashtags: string; // JSON stringified array
  model: string;
  status: PostStatus;
  generatedAt: string;
  publishedAt: string | null;
}

export class PostStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pillarId TEXT NOT NULL,
        topic TEXT NOT NULL,
        text TEXT NOT NULL,
        charCount INTEGER NOT NULL,
        hashtags TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_review',
        generatedAt TEXT NOT NULL,
        publishedAt TEXT
      );
    `);
  }

  save(post: GeneratePostResult): number {
    const stmt = this.db.prepare(`
      INSERT INTO posts (pillarId, topic, text, charCount, hashtags, model, status, generatedAt)
      VALUES (@pillarId, @topic, @text, @charCount, @hashtags, @model, 'pending_review', @generatedAt)
    `);
    const info = stmt.run({
      pillarId: post.pillarId,
      topic: post.topic,
      text: post.text,
      charCount: post.charCount,
      hashtags: JSON.stringify(post.hashtags),
      model: post.model,
      generatedAt: post.generatedAt,
    });
    return Number(info.lastInsertRowid);
  }

  listByStatus(status: PostStatus): StoredPost[] {
    return this.db
      .prepare(`SELECT * FROM posts WHERE status = ? ORDER BY generatedAt DESC`)
      .all(status) as StoredPost[];
  }

  updateStatus(id: number, status: PostStatus) {
    const publishedAt = status === "published" ? new Date().toISOString() : null;
    this.db
      .prepare(`UPDATE posts SET status = ?, publishedAt = COALESCE(?, publishedAt) WHERE id = ?`)
      .run(status, publishedAt, id);
  }

  getById(id: number): StoredPost | undefined {
    return this.db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id) as StoredPost | undefined;
  }
}
