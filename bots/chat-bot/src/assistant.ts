import type { AiBackend, ChatMessage, ToolSpec } from "./ai.ts";
import type { McpTool, T3Mcp } from "./mcp.ts";
import {
  bucketOf,
  findProject,
  listProjects,
  listThreads,
  withPendingCounts,
  type ThreadSummary,
} from "./t3.ts";

const MAX_TOOL_STEPS = 8;
const MAX_HISTORY = 24;
const MAX_TOOL_TEXT = 4000;

const SYSTEM_PROMPT = `You are a chat assistant that controls T3 Code, an app that runs coding agents (Claude Code, Codex, Grok and others) on the user's computer.
Use the tools to look up projects and threads, start threads, and send messages to them. Never guess ids: list or search first.
A "thread" is one coding agent conversation. Starting work means t3_thread_launch with a projectId and the task as the message.
Keep replies short and plain, suited to a phone chat. When you mention a thread, include its link if the tool gave one.
You cannot approve permission requests; tell the user to open the thread in T3 Code for those.`;

export const HELP = `Commands:
/status — what needs you, what's running, what's ready to review
/projects — list projects
/start <project>: <task> — start a thread in a project
/send <number>: <message> — message a thread from the last /status list
/read <number> — latest messages of a thread
/reset — forget this chat's conversation with the assistant
Anything else goes to the assistant, which can use T3 Code for you.`;

function toToolSpec(tool: McpTool): ToolSpec {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: (tool.description ?? "").slice(0, 1000),
      parameters: tool.inputSchema,
    },
  };
}

function clip(text: string, max = MAX_TOOL_TEXT): string {
  return text.length > max ? `${text.slice(0, max)}\n…(cut)` : text;
}

function line(thread: ThreadSummary, index: number): string {
  return `${index}. ${thread.title} [${thread.status}]${thread.link ? `\n   ${thread.link}` : ""}`;
}

export class Assistant {
  private readonly histories = new Map<string, ChatMessage[]>();
  /** The numbered threads from each chat's last /status, so /send 2 works. */
  private readonly lastListed = new Map<string, ThreadSummary[]>();

  private readonly mcp: T3Mcp;
  private readonly ai: AiBackend;
  private readonly allowedTools: ReadonlySet<string>;
  private readonly instructions: string;

  constructor(mcp: T3Mcp, ai: AiBackend, allowedTools: ReadonlySet<string>, instructions: string) {
    this.mcp = mcp;
    this.ai = ai;
    this.allowedTools = allowedTools;
    this.instructions = instructions;
  }

  async handle(chatId: string, text: string): Promise<string> {
    const trimmed = text.trim();
    const [command, ...rest] = trimmed.split(/\s+/);
    const args = trimmed.slice((command ?? "").length).trim();
    try {
      switch (command?.toLowerCase().replace(/@.*$/, "")) {
        case "/start":
          return rest.length === 0 ? HELP : await this.start(args);
        case "/help":
          return HELP;
        case "/status":
          return await this.status(chatId);
        case "/projects":
          return await this.projects();
        case "/send":
          return await this.send(chatId, args);
        case "/read":
          return await this.read(chatId, args);
        case "/reset":
          this.histories.delete(chatId);
          return "Done. I've forgotten our conversation.";
        default:
          return await this.chat(chatId, trimmed);
      }
    } catch (error) {
      return `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async status(chatId: string): Promise<string> {
    const threads = await withPendingCounts(this.mcp, await listThreads(this.mcp));
    const groups = {
      "needs-you": threads.filter((thread) => bucketOf(thread) === "needs-you"),
      running: threads.filter((thread) => bucketOf(thread) === "running"),
      review: threads.filter((thread) => bucketOf(thread) === "review").slice(0, 8),
    };
    const numbered = [...groups["needs-you"], ...groups.running, ...groups.review];
    this.lastListed.set(chatId, numbered);
    if (numbered.length === 0) return "Nothing is running and nothing needs you.";
    let index = 1;
    const section = (title: string, list: ThreadSummary[]) =>
      list.length === 0 ? [] : [title, ...list.map((thread) => line(thread, index++)), ""];
    return [
      ...section("Needs you", groups["needs-you"]),
      ...section("Running", groups.running),
      ...section("Ready to review", groups.review),
    ]
      .join("\n")
      .trim();
  }

  private async projects(): Promise<string> {
    const projects = await listProjects(this.mcp);
    return projects.length === 0
      ? "No projects yet."
      : projects.map((project) => `• ${project.title}`).join("\n");
  }

  private async start(args: string): Promise<string> {
    const split = args.indexOf(":");
    if (split === -1) return "Use /start <project>: <task>";
    const projects = await listProjects(this.mcp);
    const project = findProject(projects, args.slice(0, split).trim());
    if (!project) return `No project matches "${args.slice(0, split).trim()}". Try /projects.`;
    const task = args.slice(split + 1).trim();
    if (!task) return "What should the agent do?";
    const launch = (modelSelection?: { instanceId: string; model: string }) =>
      this.mcp.call("t3_thread_launch", {
        projectId: project.id,
        message: task,
        title: task.split("\n")[0]!.slice(0, 80),
        generateTitle: true,
        ...(modelSelection ? { modelSelection } : {}),
      });
    let result = await launch();
    // A project without a default model: reuse the model of its latest thread.
    if (result.isError && result.text.includes("modelSelection")) {
      const recent = (await listThreads(this.mcp, 40)).find(
        (thread) => thread.projectId === project.id,
      );
      if (recent) {
        result = await launch({ instanceId: recent.providerInstanceId, model: recent.model });
      }
    }
    if (result.isError) return `T3 Code refused: ${clip(result.text, 400)}`;
    const data = result.data as { link?: string | null } | null;
    return `Started in ${project.title}.${data?.link ? `\n${data.link}` : ""}`;
  }

  private pick(chatId: string, raw: string): ThreadSummary | null {
    const index = Number(raw.trim());
    if (!Number.isInteger(index) || index < 1) return null;
    return this.lastListed.get(chatId)?.[index - 1] ?? null;
  }

  private async send(chatId: string, args: string): Promise<string> {
    const split = args.indexOf(":");
    if (split === -1) return "Use /send <number>: <message>, with a number from /status.";
    const thread = this.pick(chatId, args.slice(0, split));
    if (!thread) return "I don't know that number. Run /status first.";
    const message = args.slice(split + 1).trim();
    if (!message) return "What should I send?";
    const result = await this.mcp.call("t3_thread_send", {
      threadId: thread.threadId,
      message,
      mode: "auto",
    });
    if (result.isError) return `T3 Code refused: ${clip(result.text, 400)}`;
    const data = result.data as { delivery?: string } | null;
    return `Sent to "${thread.title}" (${data?.delivery ?? "delivered"}).`;
  }

  private async read(chatId: string, args: string): Promise<string> {
    const thread = this.pick(chatId, args);
    if (!thread) return "I don't know that number. Run /status first.";
    const result = await this.mcp.call("t3_thread_read", {
      threadId: thread.threadId,
      limit: 4,
      maxCharsPerItem: 1200,
    });
    if (result.isError) return `T3 Code refused: ${clip(result.text, 400)}`;
    const items =
      (result.data as { items?: Array<{ type: string; text?: string | null }> } | null)?.items ??
      [];
    const lines = items
      .filter(
        (item) => item.text && (item.type === "user_message" || item.type === "assistant_message"),
      )
      .map((item) => `${item.type === "user_message" ? "You" : "Agent"}: ${item.text}`);
    return clip(
      `${thread.title} [${thread.status}]\n\n${lines.join("\n\n") || "(no messages yet)"}`,
      3500,
    );
  }

  private async chat(chatId: string, text: string): Promise<string> {
    const tools = (await this.mcp.tools())
      .filter((tool) => this.allowedTools.has(tool.name))
      .map(toToolSpec);
    const history = this.histories.get(chatId) ?? [];
    history.push({ role: "user", content: text });
    const system: ChatMessage = {
      role: "system",
      content: this.instructions ? `${SYSTEM_PROMPT}\n\n${this.instructions}` : SYSTEM_PROMPT,
    };

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const reply = await this.ai.complete([system, ...history], tools);
      history.push(reply);
      if (!reply.tool_calls?.length) {
        this.histories.set(chatId, trimHistory(history));
        return reply.content?.trim() || "(no answer)";
      }
      for (const call of reply.tool_calls) {
        history.push({
          role: "tool",
          tool_call_id: call.id,
          content: await this.runTool(call.function.name, call.function.arguments),
        });
      }
    }
    this.histories.set(chatId, trimHistory(history));
    return "I took too many steps on that one. Try asking more specifically.";
  }

  private async runTool(name: string, rawArgs: string): Promise<string> {
    if (!this.allowedTools.has(name)) return `Tool ${name} is not available.`;
    let args: Record<string, unknown>;
    try {
      args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
    } catch {
      return "The arguments were not valid JSON.";
    }
    try {
      const result = await this.mcp.call(name, args);
      const body = result.data ? JSON.stringify(result.data) : result.text;
      return clip(result.isError ? `Error: ${result.text}` : body);
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

/** Keeps the tail of a conversation without splitting a tool call from its results. */
function trimHistory(history: ChatMessage[]): ChatMessage[] {
  if (history.length <= MAX_HISTORY) return history;
  let start = history.length - MAX_HISTORY;
  while (start < history.length && history[start]?.role !== "user") start++;
  return history.slice(start);
}
