import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface BotConfig {
  /** T3 Code server origin, e.g. http://127.0.0.1:3773. Read from the running server when unset. */
  t3Url: string;
  /** MCP token from `t3 auth agent-token`. Minted automatically when unset. */
  t3Token: string;
  ai: {
    /** Any OpenAI-compatible endpoint: Ollama, LM Studio, llama.cpp, vLLM, OpenRouter, xAI, OpenAI... */
    baseUrl: string;
    apiKey: string;
    model: string;
    /** Extra instructions appended to the built-in system prompt. */
    instructions: string;
  };
  telegram: {
    token: string;
    allowedUserIds: number[];
  } | null;
  /** Read commands from this terminal too. Handy for testing without a chat app. */
  console: boolean;
  notify: {
    enabled: boolean;
    intervalSeconds: number;
  };
  /** Tool names the AI may call. Small local models do better with a short list. */
  tools: string[];
}

export const DEFAULT_TOOLS = [
  "t3_project_list",
  "t3_thread_list",
  "t3_thread_search",
  "t3_thread_read",
  "t3_thread_launch",
  "t3_thread_send",
  "t3_thread_interrupt",
  "t3_thread_organize",
  "t3_pending_request",
  "orchestrator_capabilities",
];

type FileConfig = Partial<{
  t3Url: string;
  t3Token: string;
  t3Home: string;
  ai: Partial<BotConfig["ai"]>;
  telegram: { token?: string; allowedUserIds?: Array<number | string> };
  console: boolean;
  notify: Partial<BotConfig["notify"]>;
  tools: string[];
}>;

function readFileConfig(path: string): FileConfig {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as FileConfig;
}

function t3Home(file: FileConfig): string {
  return process.env.T3CODE_HOME ?? file.t3Home ?? join(homedir(), ".t3");
}

/** The running server writes its origin here; reading it avoids guessing ports. */
function discoverT3Url(home: string): string | null {
  const runtime = join(home, "userdata", "server-runtime.json");
  if (!existsSync(runtime)) return null;
  const parsed = JSON.parse(readFileSync(runtime, "utf8")) as { origin?: string };
  return parsed.origin ?? null;
}

function mintToken(home: string, t3Command: string): string {
  const out = execFileSync(
    t3Command,
    [
      "auth",
      "agent-token",
      "--base-dir",
      home,
      "--label",
      "chat bot",
      "--access",
      "approval-required",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const token = out.trim().split("\n").at(-1) ?? "";
  if (!token) throw new Error("`t3 auth agent-token` printed no token.");
  return token;
}

function parseIds(values: Array<number | string> | string | undefined): number[] {
  const list = typeof values === "string" ? values.split(",") : (values ?? []);
  return list
    .map((value) => Number(String(value).trim()))
    .filter((id) => Number.isFinite(id) && id !== 0);
}

export function loadConfig(path = resolve(process.env.BOT_CONFIG ?? "config.json")): BotConfig {
  const file = readFileConfig(path);
  const env = process.env;
  const home = t3Home(file);
  const t3Url = env.T3_URL ?? file.t3Url ?? discoverT3Url(home);
  if (!t3Url) {
    throw new Error(
      `Could not find a running T3 Code server under ${home}. Start T3 Code, or set T3_URL.`,
    );
  }
  const t3Token = env.T3_TOKEN ?? file.t3Token ?? mintToken(home, env.T3_COMMAND ?? "t3");

  const telegramToken = env.TELEGRAM_BOT_TOKEN ?? file.telegram?.token ?? "";
  const allowed = parseIds(env.TELEGRAM_ALLOWED_USER_IDS ?? file.telegram?.allowedUserIds);
  if (telegramToken && allowed.length === 0) {
    throw new Error(
      "Telegram is set up but no allowed user ids are listed. Add your own id so strangers cannot drive your machine.",
    );
  }

  return {
    t3Url: t3Url.replace(/\/$/, ""),
    t3Token,
    ai: {
      baseUrl: (env.AI_BASE_URL ?? file.ai?.baseUrl ?? "http://localhost:11434/v1").replace(
        /\/$/,
        "",
      ),
      apiKey: env.AI_API_KEY ?? file.ai?.apiKey ?? "",
      model: env.AI_MODEL ?? file.ai?.model ?? "qwen2.5:14b",
      instructions: file.ai?.instructions ?? "",
    },
    telegram: telegramToken ? { token: telegramToken, allowedUserIds: allowed } : null,
    console: env.BOT_CONSOLE === "1" || file.console === true || !telegramToken,
    notify: {
      enabled: file.notify?.enabled ?? true,
      intervalSeconds: file.notify?.intervalSeconds ?? 20,
    },
    tools: file.tools ?? DEFAULT_TOOLS,
  };
}
