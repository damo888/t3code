import { ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { useComposerDraftStore, type DraftId } from "../../composerDraftStore";
import { useLocalStorage } from "../../hooks/useLocalStorage";

export type ProjectRole = "planner" | "builder" | "reviewer";

export const PROJECT_ROLES: ReadonlyArray<ProjectRole> = ["planner", "builder", "reviewer"];

const RoleModel = Schema.Struct({ instanceId: Schema.String, model: Schema.String });
const ProjectRolesSchema = Schema.Struct({
  planner: Schema.optional(RoleModel),
  builder: Schema.optional(RoleModel),
  reviewer: Schema.optional(RoleModel),
});
export type ProjectRoles = typeof ProjectRolesSchema.Type;

/** Roles are a per-device preference, like the rest of this personal layer. */
export function useProjectRoles(projectKey: string) {
  return useLocalStorage<ProjectRoles, typeof ProjectRolesSchema.Encoded>(
    `t3code:project-roles:${projectKey}`,
    {},
    ProjectRolesSchema,
  );
}

export function roleModelSelection(roles: ProjectRoles, role: ProjectRole): ModelSelection | null {
  const picked = roles[role];
  if (!picked) return null;
  return { instanceId: ProviderInstanceId.make(picked.instanceId), model: picked.model };
}

export function applyRoleModel(draftId: DraftId, selection: ModelSelection | null) {
  if (selection === null) return;
  useComposerDraftStore
    .getState()
    .setModelSelection(draftId, selection, { explicit: true, replaceOptions: true });
}

export function plannerPrompt(request: string): string {
  return [
    "You are the planner for this project. Do not change any code.",
    "Read the codebase as needed, then update PLAN.md at the project root.",
    "Add tasks as Markdown checklist lines (`- [ ] ...`) under `## Now`, `## Next` or `## Later`.",
    "Keep each task small enough for one agent thread, and write it as an instruction.",
    "Leave existing tasks and their `<!-- t3:thread=... -->` comments as they are.",
    "",
    `Request: ${request}`,
  ].join("\n");
}
