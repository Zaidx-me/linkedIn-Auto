import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";
import { GeneratePostResult } from "../generation/postGenerator";

export type PostStatus = "pending_review" | "approved" | "rejected" | "published";

export interface StoredPost {
  id: number;
  day: number;
  postType: string;
  hook: string;
  topic: string;
  text: string;
  charCount: number;
  hashtags: string;
  model: string;
  status: PostStatus;
  generatedAt: string;
  publishedAt: string | null;
}

export class PostStore {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private nextId = 1;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);

      // Migrate: add new columns if they don't exist
      this.migrate();
    } else {
      this.db = new SQL.Database();
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY,
        day INTEGER NOT NULL DEFAULT 0,
        postType TEXT NOT NULL DEFAULT 'lesson',
        hook TEXT NOT NULL DEFAULT '',
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

    const maxId = this.db.exec("SELECT COALESCE(MAX(id), 0) + 1 as next FROM posts");
    if (maxId.length > 0 && maxId[0].values.length > 0) {
      this.nextId = (maxId[0].values[0][0] as number) || 1;
    }

    this.save();
  }

  private migrate() {
    if (!this.db) return;
    // Check if new columns exist, add them if not
    const cols = this.db.exec("PRAGMA table_info(posts)");
    if (cols.length > 0) {
      const columnNames = cols[0].values.map((r) => r[1]);
      if (!columnNames.includes("day")) {
        this.db.run("ALTER TABLE posts ADD COLUMN day INTEGER NOT NULL DEFAULT 0");
      }
      if (!columnNames.includes("postType")) {
        this.db.run("ALTER TABLE posts ADD COLUMN postType TEXT NOT NULL DEFAULT 'lesson'");
      }
      if (!columnNames.includes("hook")) {
        this.db.run("ALTER TABLE posts ADD COLUMN hook TEXT NOT NULL DEFAULT ''");
      }
    }
  }

  private save() {
    if (!this.db) return;
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  savePost(post: GeneratePostResult): number {
    if (!this.db) throw new Error("PostStore not initialized. Call init() first.");
    const id = this.nextId++;
    const stmt = this.db.prepare(`
      INSERT INTO posts (id, day, postType, hook, topic, text, charCount, hashtags, model, status, generatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?)
    `);
    stmt.run([
      id,
      post.day,
      post.postType,
      post.hook,
      post.topic,
      post.text,
      post.charCount,
      JSON.stringify(post.hashtags),
      post.model,
      post.generatedAt,
    ]);
    stmt.free();
    this.save();
    return id;
  }

  listByStatus(status: PostStatus): StoredPost[] {
    if (!this.db) throw new Error("PostStore not initialized.");
    const stmt = this.db.prepare("SELECT * FROM posts WHERE status = ? ORDER BY generatedAt DESC");
    stmt.bind([status]);
    const rows: StoredPost[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as StoredPost);
    }
    stmt.free();
    return rows;
  }

  updateStatus(id: number, status: PostStatus) {
    if (!this.db) throw new Error("PostStore not initialized.");
    const publishedAt = status === "published" ? new Date().toISOString() : null;
    this.db.run("UPDATE posts SET status = ?, publishedAt = COALESCE(?, publishedAt) WHERE id = ?", [
      status,
      publishedAt,
      id,
    ]);
    this.save();
  }

  getById(id: number): StoredPost | undefined {
    if (!this.db) throw new Error("PostStore not initialized.");
    const stmt = this.db.prepare("SELECT * FROM posts WHERE id = ?");
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as StoredPost;
      stmt.free();
      return row;
    }
    stmt.free();
    return undefined;
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
  }
}
