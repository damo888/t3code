# T3 chat bot

A bot you talk to from Telegram (or your terminal) that drives T3 Code on the same computer. It can list what's running, start threads, message them, read their replies, and ping you when a thread needs you or finishes.

The AI behind it is your choice. It talks to any OpenAI-compatible endpoint, so it works with local models (Ollama, LM Studio, llama.cpp, vLLM) and hosted ones (Grok via xAI, OpenRouter, Groq, OpenAI). The slash commands work without any AI at all.

## What you need

- T3 Code running on this computer, built from this fork (the bot uses `t3 auth agent-token`, which this fork adds).
- Node 22.18 or newer. The bot has no dependencies; Node runs the TypeScript directly.
- An AI endpoint, unless you only want slash commands.
- For Telegram: a bot token from [@BotFather](https://t.me/BotFather) and your own Telegram user id (ask [@userinfobot](https://t.me/userinfobot)).

## Set up

```sh
cd bots/chat-bot
cp config.example.json config.json
# edit config.json
npm start
```

On first start the bot runs `t3 auth agent-token` to get its own sign-in, so the `t3` command needs to be on your PATH. If it isn't, set `T3_COMMAND` to its full path, or mint a token yourself and put it in `t3Token`:

```sh
t3 auth agent-token --label "chat bot" --access approval-required
```

`--access` caps what threads started from the bot may do: `read-only`, `approval-required` (default), `auto-accept-edits`, `auto` or `full-access`. The bot shows up under **Settings → Sharing & access** in T3 Code, where you can revoke it.

## Picking an AI

Set `ai.baseUrl`, `ai.model` and, for hosted services, `ai.apiKey`:

| Backend          | `baseUrl`                        | Example `model`                     |
| ---------------- | -------------------------------- | ----------------------------------- |
| Ollama           | `http://localhost:11434/v1`      | `qwen2.5:14b`, `llama3.1:8b`        |
| LM Studio        | `http://localhost:1234/v1`       | whatever you loaded                 |
| llama.cpp server | `http://localhost:8080/v1`       | any                                 |
| xAI (Grok)       | `https://api.x.ai/v1`            | `grok-4`                            |
| OpenRouter       | `https://openrouter.ai/api/v1`   | `meta-llama/llama-3.3-70b-instruct` |
| Groq             | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile`           |

The model needs tool calling for plain-language requests. Small local models handle the short default tool list better; you can trim or extend it with `tools` in the config.

Every setting can also come from an environment variable: `T3_URL`, `T3_TOKEN`, `T3CODE_HOME`, `T3_COMMAND`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS` (comma separated), `BOT_CONSOLE=1`, `BOT_CONFIG` (path to the config file).

## Using it

- `/status`: what needs you, what's running, what's ready to review, numbered.
- `/projects`: your projects.
- `/start t3code: add a health check endpoint`: start a thread in a project. The name can be partial.
- `/send 2: also add a test`: message thread 2 from the last `/status`.
- `/read 2`: the latest messages in thread 2.
- `/reset`: forget the conversation with the AI.
- Anything else goes to the AI, which can use the same T3 tools: "what's Claude doing in the login thread?", "start a thread in t3code to bump the deps, use Codex".

Without a Telegram token the bot runs in your terminal, which is the easiest way to try it.

## Notifications

Every 20 seconds (change with `notify.intervalSeconds`) the bot checks your threads and messages you when one starts waiting for approval or an answer, fails, or finishes. It doesn't replay old news after a restart.

## Limits

- T3 Code doesn't let outside agents approve permission requests, so the bot tells you about them and links the thread. Approve in the app (or from the Board page).
- Only the Telegram users you list can talk to it. Messages from anyone else are ignored and logged.
- It only works while this computer and T3 Code are running.
