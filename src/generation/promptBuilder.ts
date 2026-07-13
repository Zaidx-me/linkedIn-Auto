import { persona } from "../config/persona";
import { PostTemplate } from "../config/templates";

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
- Do NOT include a "Subject:" line, quotation marks around the whole post, or any meta-commentary — output ONLY the post text itself

IMPORTANT: You MUST use the exact hook provided at the opening of the post. Do not rephrase it, reword it, or create your own. The hook is the first thing people read — it stops the scroll.`;
}

export function buildUserPrompt(
  theme: string,
  hook: string,
  template: PostTemplate,
  tomorrowTheme?: string,
  extraContext?: string
): string {
  const structureGuide = template.structure.map((s) => `- ${s}`).join("\n");
  const teaseLine = tomorrowTheme
    ? `\nEnd the post by teasing tomorrow's topic: "${tomorrowTheme}"`
    : "";

  return `Write a LinkedIn post about communication skills.

Theme: ${theme}
Post type: ${template.name}

EXACT HOOK (use this as the opening line — do NOT rephrase it):
"${hook}"

Post structure to follow:
${structureGuide}
${teaseLine}
${extraContext ? `\nAdditional context to ground the post in real specifics:\n${extraContext}` : ""}

Remember: Start with the exact hook above. Be specific, concrete, and opinionated. If you don't have a real detail (a scenario, a before/after, a number) don't fake one — write around it instead of inventing data.`;
}
