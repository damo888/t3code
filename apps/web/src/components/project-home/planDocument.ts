/**
 * PLAN.md is plain Markdown so people and agents can both edit it. Only checklist items are
 * tasks; `##` headings group them. A started task remembers its thread in an HTML comment.
 */
export const PLAN_FILE_NAME = "PLAN.md";

export interface PlanTask {
  readonly line: number;
  readonly text: string;
  readonly done: boolean;
  readonly thread: { readonly environmentId: string; readonly threadId: string } | null;
}

export interface PlanGroup {
  readonly title: string;
  /** Line of the heading, or -1 for tasks above the first heading. */
  readonly line: number;
  readonly tasks: ReadonlyArray<PlanTask>;
}

const TASK = /^(\s*)[-*] \[( |x|X)\] (.*)$/;
const HEADING = /^##\s+(.+?)\s*$/;
const THREAD_TAG = /\s*<!--\s*t3:thread=([^/\s]+)\/([^\s]+)\s*-->\s*$/;

export function parsePlan(source: string): PlanGroup[] {
  const groups: { title: string; line: number; tasks: PlanTask[] }[] = [];
  let current: { title: string; line: number; tasks: PlanTask[] } | null = null;
  source.split("\n").forEach((raw, line) => {
    const heading = HEADING.exec(raw);
    if (heading) {
      current = { title: heading[1]!, line, tasks: [] };
      groups.push(current);
      return;
    }
    const task = TASK.exec(raw);
    if (!task) return;
    if (current === null) {
      current = { title: "", line: -1, tasks: [] };
      groups.push(current);
    }
    const body = task[3]!;
    const tag = THREAD_TAG.exec(body);
    current.tasks.push({
      line,
      text: tag ? body.slice(0, tag.index).trim() : body.trim(),
      done: task[2] !== " ",
      thread: tag ? { environmentId: tag[1]!, threadId: tag[2]! } : null,
    });
  });
  return groups;
}

function renderTask(task: Omit<PlanTask, "line">, indent = ""): string {
  const tag = task.thread
    ? ` <!-- t3:thread=${task.thread.environmentId}/${task.thread.threadId} -->`
    : "";
  return `${indent}- [${task.done ? "x" : " "}] ${task.text}${tag}`;
}

function replaceLine(source: string, line: number, edit: (raw: string) => string): string {
  const lines = source.split("\n");
  if (line < 0 || line >= lines.length) return source;
  lines[line] = edit(lines[line]!);
  return lines.join("\n");
}

function editTask(
  source: string,
  line: number,
  change: (task: Omit<PlanTask, "line">) => Omit<PlanTask, "line">,
): string {
  return replaceLine(source, line, (raw) => {
    const match = TASK.exec(raw);
    if (!match) return raw;
    const parsed = parsePlan(raw)[0]?.tasks[0];
    return parsed ? renderTask(change(parsed), match[1]) : raw;
  });
}

export function setTaskDone(source: string, line: number, done: boolean): string {
  return editTask(source, line, (task) => ({ ...task, done }));
}

export function linkTaskThread(
  source: string,
  line: number,
  thread: { environmentId: string; threadId: string },
): string {
  return editTask(source, line, (task) => ({ ...task, thread }));
}

export function removeTask(source: string, line: number): string {
  const lines = source.split("\n");
  if (!TASK.test(lines[line] ?? "")) return source;
  lines.splice(line, 1);
  return lines.join("\n");
}

/** Adds a task at the end of a group, creating the group when it does not exist yet. */
export function addTask(source: string, groupTitle: string, text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean === "") return source;
  const lines = source === "" ? [] : source.split("\n");
  const entry = renderTask({ text: clean, done: false, thread: null });
  const group = parsePlan(source).find((candidate) => candidate.title === groupTitle);
  if (!group) {
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    if (lines.length > 0) lines.push("");
    lines.push(`## ${groupTitle}`, "", entry, "");
    return lines.join("\n");
  }
  const last = group.tasks[group.tasks.length - 1];
  const at = last ? last.line + 1 : group.line + 1;
  lines.splice(at, 0, ...(last ? [entry] : ["", entry]));
  return lines.join("\n");
}

export const DEFAULT_PLAN_GROUPS = ["Now", "Next", "Later"] as const;

export function emptyPlan(projectTitle: string): string {
  return [
    `# ${projectTitle} plan`,
    "",
    ...DEFAULT_PLAN_GROUPS.flatMap((group) => [`## ${group}`, ""]),
  ].join("\n");
}
