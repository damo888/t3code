/** A small MCP client for T3 Code's streamable HTTP endpoint. No SDK needed. */

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  isError: boolean;
  text: string;
  data: unknown;
}

interface Envelope {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string };
}

async function readPayloads(response: Response): Promise<Envelope[]> {
  const body = await response.text();
  if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return body
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Envelope);
  }
  if (body.trim() === "") return [];
  const parsed = JSON.parse(body) as Envelope | Envelope[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

export class T3Mcp {
  private sessionId: string | null = null;
  private protocolVersion: string | null = null;
  private nextId = 1;
  private toolCache: McpTool[] | null = null;

  private readonly url: string;
  private readonly token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  private async post(message: object): Promise<Envelope[]> {
    const response = await fetch(`${this.url}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${this.token}`,
        ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
        ...(this.protocolVersion ? { "mcp-protocol-version": this.protocolVersion } : {}),
      },
      body: JSON.stringify(message),
    });
    this.sessionId = response.headers.get("mcp-session-id") ?? this.sessionId;
    if (response.status === 401) {
      throw new Error(
        "T3 Code refused the bot's token. Mint a new one with `t3 auth agent-token`.",
      );
    }
    if (response.status === 404 && this.sessionId) {
      // The server forgot our session (restart). Start over once.
      this.sessionId = null;
      this.protocolVersion = null;
      throw new SessionLostError();
    }
    if (!response.ok) throw new Error(`T3 Code MCP answered HTTP ${response.status}.`);
    return readPayloads(response);
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const replies = await this.post({ jsonrpc: "2.0", id, method, params });
    const reply = replies.find((entry) => entry.id === id);
    if (!reply) throw new Error(`No reply to ${method}.`);
    if (reply.error) throw new Error(`${method} failed: ${reply.error.message}`);
    return reply.result;
  }

  async connect(): Promise<void> {
    const result = (await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "t3-chat-bot", version: "0.1.0" },
    })) as { protocolVersion?: string };
    this.protocolVersion = result.protocolVersion ?? "2025-06-18";
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  private async withSession<T>(run: () => Promise<T>): Promise<T> {
    if (!this.sessionId) await this.connect();
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof SessionLostError)) throw error;
      await this.connect();
      return run();
    }
  }

  async tools(): Promise<McpTool[]> {
    if (this.toolCache) return this.toolCache;
    const result = (await this.withSession(() => this.request("tools/list", {}))) as {
      tools: McpTool[];
    };
    this.toolCache = result.tools;
    return result.tools;
  }

  async call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const result = (await this.withSession(() =>
      this.request("tools/call", { name, arguments: args }),
    )) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
      structuredContent?: unknown;
    };
    const text = (result.content ?? [])
      .filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("\n");
    return { isError: result.isError === true, text, data: result.structuredContent ?? null };
  }
}

class SessionLostError extends Error {
  constructor() {
    super("MCP session lost");
  }
}
