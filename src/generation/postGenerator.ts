import { NvidiaClient } from "./nvidiaClient";
import { buildSystemPrompt, buildUserPrompt } from "./promptBuilder";
import { processPost, ProcessedPost } from "./postProcessor";
import { persona } from "../config/persona";
import { PostType, getTemplate } from "../config/templates";

export interface GeneratePostRequest {
  topic: string;
  hook: string;
  postType: PostType;
  day?: number;
  tomorrowTheme?: string;
  extraContext?: string;
  temperature?: number;
}

export interface GeneratePostResult extends ProcessedPost {
  day: number;
  postType: PostType;
  hook: string;
  topic: string;
  model: string;
  generatedAt: string;
}

export class PostGenerator {
  private client: NvidiaClient;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new NvidiaClient(apiKey, model);
    this.model = model;
  }

  async generate(req: GeneratePostRequest): Promise<GeneratePostResult> {
    const template = getTemplate(req.postType);
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(
      req.topic,
      req.hook,
      template,
      req.tomorrowTheme,
      req.extraContext
    );

    const raw = await this.client.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: req.temperature ?? 0.7 }
    );

    const processed = processPost(raw);

    return {
      ...processed,
      day: req.day ?? 0,
      postType: req.postType,
      hook: req.hook,
      topic: req.topic,
      model: this.model,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Raw chat access so consumers can ask the LLM to pick a winner, etc. */
  async chat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options?: { temperature?: number }
  ): Promise<string> {
    return this.client.chat(messages, options);
  }

  /** Generate multiple variants of the same topic so you can pick the best one. */
  async generateVariants(req: GeneratePostRequest, count: number): Promise<GeneratePostResult[]> {
    const results: GeneratePostResult[] = [];
    for (let i = 0; i < count; i++) {
      // Slight temperature bump per variant for more spread
      results.push(await this.generate({ ...req, temperature: 0.6 + i * 0.15 }));
    }
    return results;
  }
}
