import { PostGenerator, GeneratePostResult } from "./generation/postGenerator";
import { persona } from "./config/persona";

function classifyPillar(topic: string): string {
  const topicLower = topic.toLowerCase();
  let best: { id: string; score: number } = { id: persona.contentPillars[0].id, score: 0 };

  for (const pillar of persona.contentPillars) {
    const keywords = pillar.exampleTopics
      .flatMap((t) => t.toLowerCase().split(" "))
      .concat(pillar.description.toLowerCase().split(" "));
    const matches = keywords.filter((kw) => topicLower.includes(kw)).length;
    if (matches > best.score) {
      best = { id: pillar.id, score: matches };
    }
  }
  return best.id;
}

export async function brainstorm(
  topic: string,
  generator: PostGenerator
): Promise<GeneratePostResult> {
  const pillarId = classifyPillar(topic);
  console.log(`Pillar: ${pillarId} | Topic: ${topic}`);

  const variants = await generator.generateVariants(
    { pillarId, topic },
    3
  );

  const pickPrompt = `You are a social media editor. Here are 3 variants of a LinkedIn post. Pick the best one (reply with ONLY the variant number: 1, 2, or 3, no other text).

Variant 1:
${variants[0].text}

Variant 2:
${variants[1].text}

Variant 3:
${variants[2].text}

Which is best? Reply with only the number.`;

  const pickRaw = await generator.chat(
    [{ role: "user", content: pickPrompt }],
    { temperature: 0.0 }
  );

  const pickIndex = Math.max(0, Math.min(2, (parseInt(pickRaw.trim()) || 1) - 1));
  const winner = variants[pickIndex];
  console.log(`Picked variant ${pickIndex + 1} (${winner.charCount} chars)`);

  return winner;
}
