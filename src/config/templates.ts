import fs from "fs";
import path from "path";

export type PostType = "lesson" | "example" | "mistake" | "challenge";

export interface PostTemplate {
  name: string;
  structure: string[];
  promptGuide: string;
}

const TEMPLATES_FILE = path.resolve(process.cwd(), "data/templates.json");
const POST_TYPES: PostType[] = ["lesson", "example", "mistake", "challenge"];

let cachedTemplates: Record<PostType, PostTemplate> | null = null;

export function loadTemplates(): Record<PostType, PostTemplate> {
  if (cachedTemplates) return cachedTemplates;
  if (!fs.existsSync(TEMPLATES_FILE)) {
    throw new Error(`Templates file not found at ${TEMPLATES_FILE}`);
  }
  const parsed: Record<PostType, PostTemplate> = JSON.parse(fs.readFileSync(TEMPLATES_FILE, "utf-8"));
  cachedTemplates = parsed;
  return parsed;
}

export function getTemplate(postType: PostType): PostTemplate {
  const templates = loadTemplates();
  const template = templates[postType];
  if (!template) {
    throw new Error(`Unknown post type "${postType}". Valid types: ${POST_TYPES.join(", ")}`);
  }
  return template;
}

export function getPostTypes(): PostType[] {
  return [...POST_TYPES];
}

export function getNextPostType(currentIndex: number): PostType {
  return POST_TYPES[currentIndex % POST_TYPES.length];
}
