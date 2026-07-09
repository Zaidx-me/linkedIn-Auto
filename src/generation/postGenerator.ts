import { NvidiaClient } from "./nvidiaClient";
import { buildSystemPrompt, buildUserPrompt } from "./promptBuilder";
import { processPost, ProcessedPost } from "./postProcessor";
import { persona, ContentPillar } from "../config/persona";

export interface GeneratePostRequest {
  pillarId: string;
  topic: string;
  extraContext?: string;
  temperature?: number;
}

export interface GeneratePostResult extends ProcessedPost {
  pillarId: string;
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

  private resolvePillar(pillarId: string): ContentPillar {
    const pillar = persona.contentPillars.find((p) => p.id === pillarId);
    if (!pillar) {
      const validIds = persona.contentPillars.map((p) => p.id).join(", ");
      throw new Error(`Unknown pillarId "${pillarId}". Valid options: ${validIds}`);
    }
    return pillar;
  }

  async generate(req: GeneratePostRequest): Promise<GeneratePostResult> {
    const pillar = this.resolvePillar(req.pillarId);

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(pillar, req.topic, req.extraContext);

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
      pillarId: pillar.id,
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
