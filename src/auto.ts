import "dotenv/config";
import { PostGenerator } from "./generation/postGenerator";
import { PostStore, PostStatus } from "./storage/postStore";
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
  store.updateStatus(id, "approved" as PostStatus);
  console.log(`Winner saved to DB (id=${id}, status=approved)`);

  // Step 2: Publish
  console.log("Publishing to LinkedIn...");
  const publisher = new Publisher();
  await publisher.publish(winner);

  store.updateStatus(id, "published" as PostStatus);
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