/**
 * Thin client for NVIDIA NIM's OpenAI-compatible chat completions endpoint.
 * Docs: https://docs.api.nvidia.com/nim/reference/
 */

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface NvidiaChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

interface NvidiaChatResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class NvidiaClient {
  private apiKey: string;
  private model: string;
  private baseUrl = "https://integrate.api.nvidia.com/v1/chat/completions";

  constructor(apiKey: string, model: string) {
    if (!apiKey) {
      throw new Error("NVIDIA_API_KEY is not set. Copy .env.example to .env and add your key.");
    }
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages: ChatMessage[], options: NvidiaChatOptions = {}): Promise<string> {
    const { temperature = 0.7, maxTokens = 700, topP = 0.9 } = options;

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `NVIDIA NIM request failed: ${res.status} ${res.statusText} — ${errBody.slice(0, 500)}`
      );
    }

    const data = (await res.json()) as NvidiaChatResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("NVIDIA NIM returned no content in response.");
    }

    return content.trim();
  }
}
