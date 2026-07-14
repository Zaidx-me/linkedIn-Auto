export type PostType = "lesson" | "example" | "mistake" | "challenge";

export interface PostTemplate {
  name: string;
  structure: string[];
  promptGuide: string;
}

const POST_TYPES: PostType[] = ["lesson", "example", "mistake", "challenge"];

const TEMPLATES: Record<PostType, PostTemplate> = {
  lesson: {
    name: "The Lesson",
    structure: [
      "Hook: Open with a controversial, definitive statement about the theme. Make it a ragebait opener that stops the scroll.",
      "Body: Break down 3 actionable points. Explain why the common belief is wrong and provide your framework.",
      "CTA: Ask 'What's your experience?' to drive engagement.",
    ],
    promptGuide:
      "Write a LinkedIn post that teaches a communication principle. Start with the exact hook provided. Then give 3 clear, actionable points that challenge the common belief. End with 'What's your experience?'",
  },
  example: {
    name: "The Example",
    structure: [
      "Before: Show the terrible, standard way people communicate in this area.",
      "After: Show the optimized, high-impact version.",
      "Lesson learned: Break down exactly why the 'After' version works.",
      "CTA: Ask a polarizing question to drive debate.",
    ],
    promptGuide:
      "Write a LinkedIn post showing a before/after comparison. Start with the exact hook provided. Show the bad way first, then the improved way. Explain why it works better. End with a polarizing question.",
  },
  mistake: {
    name: "The Mistake",
    structure: [
      "Hook: Attack a sacred cow in communication. Use the exact hook provided.",
      "Body: List 3 common mistakes people make trying to follow bad advice.",
      "Fix: Provide the better approach — the definitive solution.",
      "CTA: Ask the audience to defend the old way of doing things.",
    ],
    promptGuide:
      "Write a LinkedIn post that attacks a common communication myth. Start with the exact hook provided. List 3 mistakes people make. Then give the better approach. End by challenging the audience to defend the old way.",
  },
  challenge: {
    name: "The Challenge",
    structure: [
      "Action: Give one specific exercise to test in their workflow today.",
      "Validation: Tell them how they will know it worked.",
      "Engagement: Invite them to share results in the comments tomorrow.",
    ],
    promptGuide:
      "Write a LinkedIn post that gives the reader a practical challenge. Start with the exact hook provided. Give them one specific thing to try. Tell them how to measure success. End by inviting them to report back tomorrow.",
  },
};

export function loadTemplates(): Record<PostType, PostTemplate> {
  return TEMPLATES;
}

export function getTemplate(postType: PostType): PostTemplate {
  const template = TEMPLATES[postType];
  if (!template) {
    throw new Error(`Unknown post type "${postType}". Valid types: ${POST_TYPES.join(", ")}`);
  }
  return template;
}

export function getPostTypes(): PostType[] {
  return [...POST_TYPES];
}

export function getNextPostType(currentIndex: number): PostType {
  return POST_TYPES[currentIndex % POST_TYPES.length];
}
