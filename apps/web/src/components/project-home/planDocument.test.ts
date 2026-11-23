import { describe, expect, it } from "vite-plus/test";

import {
  addTask,
  emptyPlan,
  linkTaskThread,
  parsePlan,
  removeTask,
  setTaskDone,
} from "./planDocument";

const SAMPLE = [
  "# Plan",
  "",
  "Some notes stay untouched.",
  "",
  "## Now",
  "",
  "- [ ] Fix login <!-- t3:thread=env-1/thread-9 -->",
  "- [x] Ship board",
  "",
  "## Later",
  "",
  "* [ ] Dark mode",
  "",
].join("\n");

describe("parsePlan", () => {
  it("groups checklist items under their heading and reads thread links", () => {
    const groups = parsePlan(SAMPLE);
    expect(groups.map((group) => group.title)).toEqual(["Now", "Later"]);
    expect(groups[0]!.tasks).toEqual([
      {
        line: 6,
        text: "Fix login",
        done: false,
        thread: { environmentId: "env-1", threadId: "thread-9" },
      },
      { line: 7, text: "Ship board", done: true, thread: null },
    ]);
    expect(groups[1]!.tasks[0]!.text).toBe("Dark mode");
  });
});

describe("plan edits", () => {
  it("toggles a task and keeps its thread link", () => {
    const next = setTaskDone(SAMPLE, 6, true);
    expect(next.split("\n")[6]).toBe("- [x] Fix login <!-- t3:thread=env-1/thread-9 -->");
    expect(next.split("\n")[2]).toBe("Some notes stay untouched.");
  });

  it("links a thread to a task", () => {
    const next = linkTaskThread(SAMPLE, 7, { environmentId: "e", threadId: "t" });
    expect(parsePlan(next)[0]!.tasks[1]!.thread).toEqual({ environmentId: "e", threadId: "t" });
  });

  it("adds to the end of an existing group", () => {
    const next = addTask(SAMPLE, "Now", "  Write   tests ");
    expect(parsePlan(next)[0]!.tasks.map((task) => task.text)).toEqual([
      "Fix login",
      "Ship board",
      "Write tests",
    ]);
  });

  it("adds to an empty group and creates missing groups", () => {
    const empty = emptyPlan("Demo");
    const withNext = addTask(empty, "Next", "Plan the API");
    expect(parsePlan(withNext).find((group) => group.title === "Next")!.tasks[0]!.text).toBe(
      "Plan the API",
    );
    const withIdeas = addTask(withNext, "Ideas", "Try voice");
    expect(parsePlan(withIdeas).at(-1)).toMatchObject({ title: "Ideas" });
  });

  it("removes only task lines", () => {
    expect(parsePlan(removeTask(SAMPLE, 7))[0]!.tasks).toHaveLength(1);
    expect(removeTask(SAMPLE, 2)).toBe(SAMPLE);
  });
});
