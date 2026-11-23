import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { resolveSidebarThreadStatus, type SidebarThreadStatus } from "../Sidebar.logic";

export type BoardColumn = "needs-you" | "running" | "review" | "done";

export const BOARD_COLUMNS: ReadonlyArray<BoardColumn> = ["needs-you", "running", "review", "done"];

/** Settled threads pile up forever; the board only shows the most recent ones. */
export const DONE_COLUMN_LIMIT = 24;

const NEEDS_YOU: ReadonlySet<SidebarThreadStatus> = new Set([
  "approval",
  "input",
  "request",
  "failed",
  "limited",
]);
const RUNNING: ReadonlySet<SidebarThreadStatus> = new Set(["preparing", "working", "waiting"]);

export function resolveBoardColumn(
  thread: EnvironmentThreadShell,
  status: SidebarThreadStatus,
): BoardColumn {
  if (NEEDS_YOU.has(status)) return "needs-you";
  if (RUNNING.has(status)) return "running";
  return thread.settledOverride === "settled" ? "done" : "review";
}

export interface BoardCard {
  readonly thread: EnvironmentThreadShell;
  readonly status: SidebarThreadStatus;
}

function activityMs(thread: EnvironmentThreadShell): number {
  const value = Date.parse(thread.runtime?.updatedAt ?? thread.updatedAt);
  return Number.isNaN(value) ? 0 : value;
}

export function buildBoardColumns(
  threads: ReadonlyArray<EnvironmentThreadShell>,
): Record<BoardColumn, BoardCard[]> {
  const columns: Record<BoardColumn, BoardCard[]> = {
    "needs-you": [],
    running: [],
    review: [],
    done: [],
  };
  for (const thread of threads) {
    const status = resolveSidebarThreadStatus(thread);
    columns[resolveBoardColumn(thread, status)].push({ thread, status });
  }
  for (const column of BOARD_COLUMNS) {
    columns[column].sort((left, right) => activityMs(right.thread) - activityMs(left.thread));
  }
  columns.done = columns.done.slice(0, DONE_COLUMN_LIMIT);
  return columns;
}
