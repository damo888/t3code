import { useAtomValue } from "@effect/atom-react";
import { T, useGT } from "gt-react";
import { ListPlusIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { ProviderInstanceId } from "@t3tools/contracts";

import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import { providerInstanceEntriesFor } from "../../providerInstances";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  applyRoleModel,
  plannerPrompt,
  PROJECT_ROLES,
  roleModelSelection,
  type ProjectRole,
  type ProjectRoles,
} from "./projectRoles";

function RolePicker({
  project,
  label,
  picked,
  onPick,
}: {
  project: EnvironmentProject;
  label: ReactNode;
  picked: { instanceId: string; model: string } | undefined;
  onPick: (instanceId: ProviderInstanceId, model: string) => void;
}) {
  const gt = useGT();
  const settings = useEnvironmentSettings(project.environmentId);
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(project.environmentId)) ??
    EMPTY_SERVER_PROVIDERS;
  const entries = providerInstanceEntriesFor(providers, settings, project.id);
  const first = entries.find((entry) => entry.enabled) ?? entries[0];
  const instanceId = (picked?.instanceId ?? first?.instanceId ?? "") as ProviderInstanceId;
  const model = picked?.model ?? "";
  if (!first) return null;
  return (
    <label className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <span>{label}</span>
      <ProviderModelPicker
        environmentId={project.environmentId}
        workspaceCwd={project.workspaceRoot}
        activeInstanceId={instanceId}
        model={model}
        lockedProvider={null}
        instanceEntries={entries}
        modelOptionsByInstance={getCustomModelOptionsByInstance(
          settings,
          providers,
          instanceId,
          model,
        )}
        isComposerOwned={false}
        compact
        {...(picked ? {} : { triggerLabel: gt("Default") })}
        onInstanceModelChange={onPick}
      />
    </label>
  );
}

/** Which bot does which job in this project. Unset roles use the normal default model. */
export function BotsBar({
  project,
  roles,
  onChange,
}: {
  project: EnvironmentProject;
  roles: ProjectRoles;
  onChange: (next: ProjectRoles) => void;
}) {
  const labels: Record<ProjectRole, ReactNode> = {
    planner: <T>Planner</T>,
    builder: <T>Builder</T>,
    reviewer: <T>Reviewer</T>,
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-5 py-2">
      <span className="font-medium text-xs">
        <T>Bots</T>
      </span>
      {PROJECT_ROLES.map((role) => (
        <RolePicker
          key={role}
          project={project}
          label={labels[role]}
          picked={roles[role]}
          onPick={(instanceId, model) => onChange({ ...roles, [role]: { instanceId, model } })}
        />
      ))}
    </div>
  );
}

export function AskPlanner({
  project,
  roles,
}: {
  project: EnvironmentProject;
  roles: ProjectRoles;
}) {
  const gt = useGT();
  const handleNewThread = useNewThreadHandler();
  const [request, setRequest] = useState("");
  const submit = async () => {
    const text = request.trim();
    if (text === "") return;
    const opened = await handleNewThread(scopeProjectRef(project.environmentId, project.id), {
      prompt: plannerPrompt(text),
    });
    if (!opened) return;
    applyRoleModel(opened.draftId, roleModelSelection(roles, "planner"));
    setRequest("");
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card p-2">
      <ListPlusIcon className="ms-1 size-4 shrink-0 text-muted-foreground" />
      <Input
        value={request}
        placeholder={gt("Ask the planner to break down a goal into tasks")}
        onChange={(event) => setRequest(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
      />
      <Button size="sm" disabled={request.trim() === ""} onClick={() => void submit()}>
        <T>Plan it</T>
      </Button>
    </div>
  );
}
