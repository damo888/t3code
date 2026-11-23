import { createInterface } from "node:readline";

export type MessageHandler = (chatId: string, text: string) => Promise<string>;

/** A chat app the bot can talk through. Telegram today; Discord or others implement the same. */
export interface ChatAdapter {
  name: string;
  start(onMessage: MessageHandler): Promise<void>;
  /** Sends to every allowed user, for notifications. */
  broadcast(text: string): Promise<void>;
}

export class TelegramAdapter implements ChatAdapter {
  name = "telegram";
  private offset = 0;

  private readonly token: string;
  private readonly allowedUserIds: ReadonlyArray<number>;

  constructor(token: string, allowedUserIds: ReadonlyArray<number>) {
    this.token = token;
    this.allowedUserIds = allowedUserIds;
  }

  private async api<T>(method: string, body: object): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsed = (await response.json()) as { ok: boolean; result: T; description?: string };
    if (!parsed.ok) throw new Error(`Telegram ${method}: ${parsed.description ?? response.status}`);
    return parsed.result;
  }

  private async send(chatId: number | string, text: string) {
    // Telegram caps messages at 4096 characters.
    for (let at = 0; at < text.length; at += 4000) {
      await this.api("sendMessage", {
        chat_id: chatId,
        text: text.slice(at, at + 4000),
        link_preview_options: { is_disabled: true },
      });
    }
  }

  async broadcast(text: string) {
    for (const id of this.allowedUserIds) await this.send(id, text);
  }

  async start(onMessage: MessageHandler) {
    await this.api("setMyCommands", {
      commands: [
        { command: "status", description: "What needs you and what's running" },
        { command: "projects", description: "List projects" },
        { command: "start", description: "<project>: <task>" },
        { command: "send", description: "<number>: <message>" },
        { command: "read", description: "<number>" },
        { command: "reset", description: "Forget this conversation" },
      ],
    }).catch(() => undefined);
    void this.loop(onMessage);
  }

  private async loop(onMessage: MessageHandler) {
    for (;;) {
      try {
        const updates = await this.api<
          Array<{
            update_id: number;
            message?: { chat: { id: number }; from?: { id: number }; text?: string };
          }>
        >("getUpdates", { offset: this.offset, timeout: 50, allowed_updates: ["message"] });
        for (const update of updates) {
          this.offset = update.update_id + 1;
          const message = update.message;
          if (!message?.text || !message.from) continue;
          if (!this.allowedUserIds.includes(message.from.id)) {
            console.warn(`[telegram] ignored message from user ${message.from.id}`);
            continue;
          }
          await this.api("sendChatAction", { chat_id: message.chat.id, action: "typing" }).catch(
            () => undefined,
          );
          const reply = await onMessage(`tg:${message.chat.id}`, message.text);
          await this.send(message.chat.id, reply);
        }
      } catch (error) {
        console.error("[telegram]", error instanceof Error ? error.message : error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }
}

export class ConsoleAdapter implements ChatAdapter {
  name = "console";

  async broadcast(text: string) {
    console.log(`\n[notify] ${text}\n`);
  }

  async start(onMessage: MessageHandler) {
    const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "you> " });
    rl.prompt();
    // One message at a time, in order, like a chat.
    let queue = Promise.resolve();
    rl.on("line", (line) => {
      queue = queue.then(async () => {
        if (line.trim()) console.log(`bot> ${await onMessage("console", line)}`);
        rl.prompt();
      });
    });
  }
}
