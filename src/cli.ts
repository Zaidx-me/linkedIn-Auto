/**
 * Quick CLI for generating a post without spinning up the server.
 * Usage: npm run generate:cli -- <postType> <topic> <hook>
 * Example: npm run generate:cli -- lesson "Why communication matters" "Intelligence is entirely useless if you can't articulate your thoughts."
 */
import "dotenv/config";
import { PostGenerator } from "./generation/postGenerator";
import { PostType } from "./config/templates";

async function main() {
  const [postType, topic, ...hookParts] = process.argv.slice(2);
  const hook = hookParts.join(" ");

  const validTypes: PostType[] = ["lesson", "example", "mistake", "challenge"];
  if (!postType || !topic || !hook || !validTypes.includes(postType as PostType)) {
    console.log("Usage: npm run generate:cli -- <postType> <topic> <hook>");
    console.log("\nPost types:");
    console.log("  lesson    - Teach a principle (hook -> 3 points -> CTA)");
    console.log("  example   - Before/after comparison");
    console.log("  mistake   - Attack a sacred cow (hook -> 3 mistakes -> fix)");
    console.log("  challenge - Give the reader an exercise");
    console.log("\nExample:");
    console.log('  npm run generate:cli -- lesson "Why communication matters" "Intelligence is entirely useless if you can\'t articulate your thoughts."');
    process.exit(1);
  }

  const generator = new PostGenerator(
    process.env.NVIDIA_API_KEY || "",
    process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct"
  );

  console.log(`Generating ${postType} post on: "${topic}"...\n`);
  console.log(`Hook: "${hook}"\n`);

  const result = await generator.generate({
    topic,
    hook,
    postType: postType as PostType,
  });

  console.log("--- GENERATED POST ---\n");
  console.log(result.text);
  console.log(`\n--- META ---`);
  console.log(`Type: ${result.postType} | Chars: ${result.charCount} | Hashtags: ${result.hashtags.join(", ")}`);
  if (result.warnings.length) {
    console.log(`Warnings:\n${result.warnings.map((w) => `  - ${w}`).join("\n")}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
