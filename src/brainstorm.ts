import { PostGenerator, GeneratePostResult } from "./generation/postGenerator";
import { PostType } from "./config/templates";

export async function generatePost(
  topic: string,
  hook: string,
  postType: PostType,
  generator: PostGenerator,
  tomorrowTheme?: string
): Promise<GeneratePostResult> {
  console.log(`Generating ${postType} post: "${topic}"`);

  const variants = await generator.generateVariants(
    { topic, hook, postType, tomorrowTheme },
    3
  );

  if (variants.length < 3) {
    throw new Error(`Expected 3 variants but got ${variants.length}`);
  }

  const pickPrompt = `You are a social media editor. Here are 3 variants of a LinkedIn post. Pick the best one (reply with ONLY the variant number: 1, 2, or 3, no other text).

Variant 1:
${variants[0].text}

Variant 2:
${variants[1].text}

Variant 3:
${variants[2].text}

Which is best? Reply with only the number.`;

  let pickRaw: string;
  try {
    pickRaw = await generator.chat(
      [{ role: "user", content: pickPrompt }],
      { temperature: 0.0 }
    );
  } catch (err) {
    throw new Error(`Failed to pick best variant: ${err}`);
  }

  const pickIndex = Math.max(0, Math.min(2, (parseInt(pickRaw.trim()) || 1) - 1));
  const winner = variants[pickIndex];
  console.log(`Picked variant ${pickIndex + 1} (${winner.charCount} chars)`);

  return winner;
}
