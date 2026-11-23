import { OpenAiCompatibleBackend } from "./ai.ts";
import { Assistant } from "./assistant.ts";
import { ConsoleAdapter, TelegramAdapter, type ChatAdapter } from "./chat.ts";
import { loadConfig } from "./config.ts";
import { T3Mcp } from "./mcp.ts";
import { Watcher } from "./watcher.ts";

const config = loadConfig();
const mcp = new T3Mcp(config.t3Url, config.t3Token);
await mcp.connect();

const assistant = new Assistant(
  mcp,
  new OpenAiCompatibleBackend(config.ai.baseUrl, config.ai.apiKey, config.ai.model),
  new Set(config.tools),
  config.ai.instructions,
);

const adapters: ChatAdapter[] = [];
if (config.telegram) {
  adapters.push(new TelegramAdapter(config.telegram.token, config.telegram.allowedUserIds));
}
if (config.console) adapters.push(new ConsoleAdapter());

for (const adapter of adapters) {
  await adapter.start((chatId, text) => assistant.handle(chatId, text));
}

if (config.notify.enabled) {
  const watcher = new Watcher(mcp, async (text) => {
    for (const adapter of adapters) await adapter.broadcast(text).catch(console.error);
  });
  watcher.start(config.notify.intervalSeconds);
}

console.log(
  `T3 chat bot running. T3: ${config.t3Url}. AI: ${config.ai.model} at ${config.ai.baseUrl}. Chats: ${adapters.map((adapter) => adapter.name).join(", ")}.`,
);
