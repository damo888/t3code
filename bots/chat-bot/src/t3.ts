import type { T3Mcp } from "./mcp.ts";

export interface ThreadSummary {
  threadId: string;
  projectId: string;
  title: string;
  link: string | null;
  status: string;
  model: string;
  providerInstanceId: string;
  settled: boolean;
  updatedAt: string;
  /** Approvals and questions waiting on the user. Only filled in by `withPendingCounts`. */
  pendingRequestCount?: number;
}

export interface ProjectSummary {
  id: string;
  title: string;
}

export type Bucket = "needs-you" | "running" | "review" | "other";

const RUNNING = new Set(["preparing", "queued", "starting", "running"]);

/** Same grouping as the Board page in the app. */
export function bucketOf(thread: ThreadSummary): Bucket {
  if ((thread.pendingRequestCount ?? 0) > 0) return "needs-you";
  if (thread.status === "waiting" || thread.status === "failed") return "needs-you";
  if (RUNNING.has(thread.status)) return "running";
  if (thread.status === "completed" && !thread.settled) return "review";
  return "other";
}

export async function listThreads(mcp: T3Mcp, limit = 40): Promise<ThreadSummary[]> {
  const result = await mcp.call("t3_thread_list", { allProjects: true, limit });
  if (result.isError) throw new Error(result.text || "t3_thread_list failed");
  const data = result.data as { threads?: ThreadSummary[] } | null;
  return data?.threads ?? [];
}

export async function listProjects(mcp: T3Mcp): Promise<ProjectSummary[]> {
  const result = await mcp.call("t3_project_list", { limit: 100 });
  if (result.isError) throw new Error(result.text || "t3_project_list failed");
  const data = result.data as { projects?: ProjectSummary[] } | null;
  return (data?.projects ?? []).map((project) => ({ id: project.id, title: project.title }));
}

export function findProject(projects: ProjectSummary[], query: string): ProjectSummary | null {
  const needle = query.toLowerCase();
  return (
    projects.find((project) => project.title.toLowerCase() === needle) ??
    projects.find((project) => project.title.toLowerCase().startsWith(needle)) ??
    projects.find((project) => project.title.toLowerCase().includes(needle)) ??
    null
  );
}

/**
 * The thread list does not say whether a running thread is blocked on an approval, so read
 * each active one. Only active threads can be waiting, which keeps this to a few calls.
 */
export async function withPendingCounts(
  mcp: T3Mcp,
  threads: ThreadSummary[],
): Promise<ThreadSummary[]> {
  return Promise.all(
    threads.map(async (thread) => {
      if (!RUNNING.has(thread.status) && thread.status !== "waiting") return thread;
      const result = await mcp.call("t3_thread_read", { threadId: thread.threadId, limit: 1 });
      const count = (result.data as { thread?: { pendingRequestCount?: number } } | null)?.thread
        ?.pendingRequestCount;
      return { ...thread, pendingRequestCount: count ?? 0 };
    }),
  );
}
