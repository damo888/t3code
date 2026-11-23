/**
 * Talks to any OpenAI-compatible chat completions endpoint. That one shape covers Ollama,
 * LM Studio, llama.cpp's server, vLLM, OpenRouter, Groq, xAI (Grok), OpenAI and more.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface AiBackend {
  complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatMessage>;
}

export class OpenAiCompatibleBackend implements AiBackend {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(baseUrl: string, apiKey: string, model: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatMessage> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
        temperature: 0.2,
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`AI backend answered HTTP ${response.status}: ${detail}`);
    }
    const body = (await response.json()) as { choices?: Array<{ message?: ChatMessage }> };
    const message = body.choices?.[0]?.message;
    if (!message) throw new Error("AI backend sent no message.");
    return {
      role: "assistant",
      content: message.content ?? null,
      ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
    };
  }
}
