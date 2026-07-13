import { persona } from "../config/persona";

export interface ProcessedPost {
  text: string;
  charCount: number;
  hashtags: string[];
  withinLimit: boolean;
  warnings: string[];
}

export interface ScoreResult {
  score: number; // 0-10
  reasons: string[];
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
    (text.startsWith("\u201c") && text.endsWith("\u201d"))
  ) {
    text = text.slice(1, -1).trim();
  }

  const hashtags = (text.match(/#\w+/g) || []).filter(
    (h, i, arr) => arr.indexOf(h) === i
  );

  const [minTags, maxTags] = persona.hashtagStyle.count;
  if (hashtags.length < minTags) {
    warnings.push(
      `Only ${hashtags.length} hashtag(s) found, expected at least ${minTags}.`
    );
  }
  if (hashtags.length > maxTags) {
    warnings.push(
      `${hashtags.length} hashtags found, more than the max of ${maxTags}.`
    );
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
    warnings.push(
      `Found ${emojiCount} emoji(s) but persona config disables emojis.`
    );
  } else if (emojiCount > 1) {
    warnings.push(
      `Found ${emojiCount} emojis — persona rule allows at most 1.`
    );
  }

  return { text, charCount, hashtags, withinLimit, warnings };
}

/**
 * Scores a post against the persona rubric.
 * Returns a score 0-10 and reasons for the score.
 */
export function scorePost(text: string): ScoreResult {
  const reasons: string[] = [];
  let score = 0;
  const textLower = text.toLowerCase();

  // Voice match (0-3): sounds like a sharp communicator, not a marketer
  const corporateSpeak = [
    "synergy", "leverage", "deep dive", "circle back", "game-changer",
    "thought leader", "passionate", "excited to announce", "humbled",
    "thrilled to share", "in today's fast-paced",
  ];
  const corporateCount = corporateSpeak.filter((w) =>
    textLower.includes(w)
  ).length;
  if (corporateCount === 0) {
    score += 3;
    reasons.push("Clean voice — no corporate speak");
  } else if (corporateCount <= 1) {
    score += 1;
    reasons.push(`Minor corporate speak detected (${corporateCount} instance)`);
  } else {
    reasons.push(`Too much corporate speak (${corporateCount} instances)`);
  }

  // Hook quality (0-2): opens with a strong statement
  const firstLine = text.split("\n")[0].trim();
  const hasWeakOpen =
    firstLine.toLowerCase().startsWith("i think") ||
    firstLine.toLowerCase().startsWith("maybe") ||
    firstLine.toLowerCase().startsWith("so,") ||
    firstLine.toLowerCase().startsWith("well,") ||
    firstLine.toLowerCase().startsWith("i recently");
  if (!hasWeakOpen && firstLine.length > 10) {
    score += 2;
    reasons.push("Strong hook opener");
  } else if (hasWeakOpen) {
    reasons.push("Weak hook opener — starts with hedge/filler");
  } else {
    score += 1;
    reasons.push("Hook present but could be stronger");
  }

  // Tone compliance (0-2): short paragraphs, opinionated
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const avgParagraphLength =
    paragraphs.reduce((sum, p) => sum + p.length, 0) / Math.max(paragraphs.length, 1);
  if (avgParagraphLength < 200) {
    score += 2;
    reasons.push("Good paragraph length — scannable");
  } else if (avgParagraphLength < 400) {
    score += 1;
    reasons.push("Paragraphs acceptable but could be shorter");
  } else {
    reasons.push("Paragraphs too long — hard to scan on mobile");
  }

  // Avoid compliance (0-2): no banned phrases
  const banned = [
    "agree? let me know", "drop a", "what do you think?",
    "i'd love to hear", "let's discuss", "follow for more",
  ];
  const bannedCount = banned.filter((b) => textLower.includes(b)).length;
  if (bannedCount === 0) {
    score += 2;
    reasons.push("No engagement bait detected");
  } else {
    reasons.push(`Engagement bait detected (${bannedCount} instance)`);
  }

  // Formatting (0-1): within char limit
  if (text.length <= persona.formatting.maxChars) {
    score += 1;
    reasons.push(`Within char limit (${text.length}/${persona.formatting.maxChars})`);
  } else {
    reasons.push(`Over char limit (${text.length}/${persona.formatting.maxChars})`);
  }

  // Hashtags (0-1): has 2-4 hashtags
  const tags = text.match(/#\w+/g) || [];
  const [min, max] = persona.hashtagStyle.count;
  if (tags.length >= min && tags.length <= max) {
    score += 1;
    reasons.push(`Good hashtag count (${tags.length})`);
  } else {
    reasons.push(`Bad hashtag count (${tags.length}, expected ${min}-${max})`);
  }

  return { score, reasons };
}
