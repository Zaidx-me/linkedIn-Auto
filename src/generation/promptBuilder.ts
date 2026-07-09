import { persona, ContentPillar } from "../config/persona";

export function buildSystemPrompt(): string {
  const toneRules = persona.toneRules.map((r) => `- ${r}`).join("\n");
  const avoidRules = persona.avoidRules.map((r) => `- ${r}`).join("\n");

  return `You are ghostwriting LinkedIn posts for a real person with this voice:

${persona.voiceDescription}

TONE RULES (follow strictly):
${toneRules}

NEVER DO THIS:
${avoidRules}

FORMAT:
- Target length: under ${persona.formatting.maxChars} characters
- ${persona.formatting.useLineBreaks ? "Use short paragraphs with line breaks for readability" : "Write as continuous prose"}
- ${persona.formatting.useEmojis ? "At most 1 emoji, only if it adds real signal" : "No emojis"}
- End with ${persona.hashtagStyle.count[0]}-${persona.hashtagStyle.count[1]} relevant hashtags on their own line
- Do NOT include a "Subject:" line, quotation marks around the whole post, or any meta-commentary — output ONLY the post text itself`;
}

export function buildUserPrompt(pillar: ContentPillar, topic: string, extraContext?: string): string {
  return `Content pillar: ${pillar.label} — ${pillar.description}

Write a LinkedIn post about this specific topic: "${topic}"
${extraContext ? `\nAdditional context to ground the post in real specifics:\n${extraContext}` : ""}

Remember: be specific and concrete. If you don't have a real detail (a number, a command, an error message) don't fake one — write around it instead of inventing data.`;
}
