import { PostGenerator, GeneratePostResult } from "./generation/postGenerator";
import { persona } from "./config/persona";

function classifyPillar(topic: string): { id: string; score: number } {
  if (persona.contentPillars.length === 0) {
    throw new Error("persona.contentPillars is empty — cannot classify topic");
  }

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
  return best;
}

export async function brainstorm(
  topic: string,
  generator: PostGenerator
): Promise<GeneratePostResult> {
  const { id: pillarId, score: bestScore } = classifyPillar(topic);

  let resolvedPillarId = pillarId;
  if (bestScore === 0) {
    const pillarDescriptions = persona.contentPillars
      .map((p) => `${p.id}: ${p.description}`)
      .join("\n");
    const classifyPrompt = `Given these content pillars:\n${pillarDescriptions}\n\nWhich pillar best fits this topic?\nTopic: "${topic}"\nReply with only the pillar ID.`;
    const raw = await generator.chat(
      [{ role: "user", content: classifyPrompt }],
      { temperature: 0.0 }
    );
    const trimmed = raw.trim();
    const validIds = persona.contentPillars.map((p) => p.id);
    if (validIds.includes(trimmed)) {
      resolvedPillarId = trimmed;
    }
  }

  console.log(`Pillar: ${resolvedPillarId} | Topic: ${topic}`);

  const variants = await generator.generateVariants(
    { pillarId: resolvedPillarId, topic },
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
