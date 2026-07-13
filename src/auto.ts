import "dotenv/config";
import { PostGenerator } from "./generation/postGenerator";
import { PostStore } from "./storage/postStore";
import { Publisher } from "./publish/publisher";
import { PostType } from "./config/templates";

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct";
const DB_PATH = process.env.DB_PATH || "./data/posts.db";

async function main() {
  const [postType, topic, ...hookParts] = process.argv.slice(2);
  const hook = hookParts.join(" ");

  const validTypes: PostType[] = ["lesson", "example", "mistake", "challenge"];
  if (!postType || !topic || !hook || !validTypes.includes(postType as PostType)) {
    console.error("Usage: npm run start -- <postType> <topic> <hook>");
    console.error("\nPost types: lesson, example, mistake, challenge");
    console.error('\nExample: npm run start -- lesson "Why communication matters" "Intelligence is entirely useless if you can\'t articulate your thoughts."');
    process.exit(1);
  }

  console.log(`\n=== LinkedIn AutoPost ===`);
  console.log(`Type: ${postType}`);
  console.log(`Theme: "${topic}"`);
  console.log(`Hook: "${hook}"\n`);

  const generator = new PostGenerator(NVIDIA_API_KEY, NVIDIA_MODEL);
  const store = new PostStore(DB_PATH);
  await store.init();

  // Generate 3 variants and pick best
  console.log("Generating variants...");
  const variants = await generator.generateVariants(
    { topic, hook, postType: postType as PostType },
    3
  );

  // Pick the one with best char count (closest to 1300 but under)
  const winner = variants.sort((a, b) => {
    const aScore = a.withinLimit ? a.charCount : 0;
    const bScore = b.withinLimit ? b.charCount : 0;
    return bScore - aScore;
  })[0];

  // Save as approved
  const id = store.savePost(winner);
  store.updateStatus(id, "approved");
  console.log(`Winner saved to DB (id=${id}, status=approved)`);

  // Publish to LinkedIn
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
