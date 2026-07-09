/**
 * Quick CLI for generating a post without spinning up the server.
 * Usage: npm run generate:cli -- os-tips "Disabling NetworkManager-wait-online.service"
 */
import "dotenv/config";
import { PostGenerator } from "./generation/postGenerator";
import { persona } from "./config/persona";

async function main() {
  const [pillarId, ...topicParts] = process.argv.slice(2);
  const topic = topicParts.join(" ");

  if (!pillarId || !topic) {
    console.log("Usage: npm run generate:cli -- <pillarId> <topic>");
    console.log("\nAvailable pillars:");
    persona.contentPillars.forEach((p) => console.log(`  ${p.id} — ${p.label}`));
    process.exit(1);
  }

  const generator = new PostGenerator(
    process.env.NVIDIA_API_KEY || "",
    process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct"
  );

  console.log(`Generating post for pillar "${pillarId}" on topic: "${topic}"...\n`);
  const result = await generator.generate({ pillarId, topic });

  console.log("--- GENERATED POST ---\n");
  console.log(result.text);
  console.log(`\n--- META ---`);
  console.log(`Chars: ${result.charCount} | Hashtags: ${result.hashtags.join(", ")}`);
  if (result.warnings.length) {
    console.log(`Warnings:\n${result.warnings.map((w) => `  - ${w}`).join("\n")}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
