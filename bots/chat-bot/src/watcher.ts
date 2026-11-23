import type { T3Mcp } from "./mcp.ts";
import { bucketOf, listThreads, withPendingCounts, type Bucket, type ThreadSummary } from "./t3.ts";

/**
 * Polls T3 Code and reports threads that move into "needs you" or "ready to review".
 * The first poll only records the current state, so a restart does not replay old news.
 */
export class Watcher {
  private known = new Map<string, Bucket>();
  private primed = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  private readonly mcp: T3Mcp;
  private readonly notify: (text: string) => Promise<void>;

  constructor(mcp: T3Mcp, notify: (text: string) => Promise<void>) {
    this.mcp = mcp;
    this.notify = notify;
  }

  start(intervalSeconds: number) {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalSeconds * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async poll(): Promise<void> {
    let threads: ThreadSummary[];
    try {
      threads = await withPendingCounts(this.mcp, await listThreads(this.mcp, 60));
    } catch (error) {
      console.error("[watcher]", error instanceof Error ? error.message : error);
      return;
    }
    const next = new Map<string, Bucket>();
    for (const thread of threads) {
      const bucket = bucketOf(thread);
      next.set(thread.threadId, bucket);
      const before = this.known.get(thread.threadId);
      if (!this.primed || before === bucket) continue;
      const message = describe(thread, bucket);
      if (message) await this.notify(message);
    }
    this.known = next;
    this.primed = true;
  }
}

function describe(thread: ThreadSummary, bucket: Bucket): string | null {
  const link = thread.link ? `\n${thread.link}` : "";
  if (bucket === "needs-you") {
    return thread.status === "failed"
      ? `❌ "${thread.title}" failed.${link}`
      : (thread.pendingRequestCount ?? 0) > 0
        ? `✋ "${thread.title}" is asking for approval or an answer. Open it in T3 Code.${link}`
        : `✋ "${thread.title}" is waiting on you.${link}`;
  }
  if (bucket === "review") return `✅ "${thread.title}" finished and is ready to review.${link}`;
  return null;
}
