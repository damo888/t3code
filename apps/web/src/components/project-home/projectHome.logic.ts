export type ProjectHomeTab = "plan" | "board" | "review";

export function projectHomeSearchFromUrl(search: Record<string, unknown>): {
  tab: ProjectHomeTab;
} {
  const tab = search.tab;
  return { tab: tab === "board" || tab === "review" ? tab : "plan" };
}

export function taskPrompt(task: string): string {
  // oxlint-disable-next-line t3code/no-untranslated-copy -- agent prompt
  return `${task}\n\nThis task comes from PLAN.md. When it is done, tick its checkbox in PLAN.md.`;
}

export function reviewPrompt(title: string, branch: string | null): string {
  const where = branch ? ` on branch \`${branch}\`` : "";
  return [
    `Review the work from the thread "${title}"${where}.`,
    "Read the diff against the base branch. List bugs, risky changes and missing tests, most serious first.",
    "Do not change any code.",
  ].join("\n");
}
