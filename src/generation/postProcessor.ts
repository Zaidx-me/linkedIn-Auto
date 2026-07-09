import { persona } from "../config/persona";

export interface ProcessedPost {
  text: string;
  charCount: number;
  hashtags: string[];
  withinLimit: boolean;
  warnings: string[];
}

/**
 * Cleans model output and validates it against persona formatting rules.
 * Does NOT rewrite content — just strips artifacts models commonly leave in
 * (wrapping quotes, "Here's your post:" preambles) and reports metrics.
 */
export function processPost(raw: string): ProcessedPost {
  const warnings: string[] = [];
  let text = raw.trim();

  // Strip common LLM preambles
  text = text.replace(/^(here'?s?( is)? your (linkedin )?post:?\s*)/i, "");
  text = text.replace(/^(sure[,!]?\s*)/i, "");

  // Strip wrapping quotes if the whole thing got quoted
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("“") && text.endsWith("”"))
  ) {
    text = text.slice(1, -1).trim();
  }

  const hashtags = (text.match(/#\w+/g) || []).filter((h, i, arr) => arr.indexOf(h) === i);

  const [minTags, maxTags] = persona.hashtagStyle.count;
  if (hashtags.length < minTags) {
    warnings.push(`Only ${hashtags.length} hashtag(s) found, expected at least ${minTags}.`);
  }
  if (hashtags.length > maxTags) {
    warnings.push(`${hashtags.length} hashtags found, more than the max of ${maxTags}.`);
  }

  const charCount = text.length;
  const withinLimit = charCount <= persona.formatting.maxChars;
  if (!withinLimit) {
    warnings.push(
      `Post is ${charCount} chars, over the ${persona.formatting.maxChars} char target — consider trimming.`
    );
  }

  const emojiCount = (text.match(/\p{Emoji_Presentation}/gu) || []).length;
  if (!persona.formatting.useEmojis && emojiCount > 0) {
    warnings.push(`Found ${emojiCount} emoji(s) but persona config disables emojis.`);
  } else if (emojiCount > 1) {
    warnings.push(`Found ${emojiCount} emojis — persona rule allows at most 1.`);
  }

  return { text, charCount, hashtags, withinLimit, warnings };
}
