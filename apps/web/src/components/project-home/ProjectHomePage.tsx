import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { Link, useNavigate } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { T, useGT } from "gt-react";
import { PlayIcon, PlusIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { AuthFilesystemWriteScope, EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

import { isElectron } from "../../env";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useProject, useThreadShell } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { useEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  BoardColumns,
  StatusGlyph,
  useBoardThreads,
  useStatusLabel,
} from "../board/MissionBoardPage";
import { buildBoardColumns } from "../board/missionBoard.logic";
import { ProjectFavicon } from "../ProjectFavicon";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset } from "../ui/sidebar";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  addTask,
  emptyPlan,
  linkTaskThread,
  parsePlan,
  PLAN_FILE_NAME,
  removeTask,
  setTaskDone,
  type PlanTask,
} from "./planDocument";
import { AskPlanner, BotsBar } from "./ProjectBots";
import { reviewPrompt, taskPrompt, type ProjectHomeTab } from "./projectHome.logic";
import {
  applyRoleModel,
  roleModelSelection,
  useProjectRoles,
  type ProjectRoles,
} from "./projectRoles";

function TaskThreadStatus({ thread }: { thread: NonNullable<PlanTask["thread"]> }) {
  const ref = scopeThreadRef(
    EnvironmentId.make(thread.environmentId),
    ThreadId.make(thread.threadId),
  );
  const shell = useThreadShell(ref);
  const statusLabel = useStatusLabel();
  if (!shell) {
    return (
      <span className="text-muted-foreground text-xs">
        <T>Draft</T>
      </span>
    );
  }
  const status = resolveSidebarThreadStatus(shell);
  return (
    <Link
      to="/$environmentId/$threadId"
      params={{ environmentId: ref.environmentId, threadId: ref.threadId }}
      className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs no-underline hover:bg-accent"
    >
      <StatusGlyph status={status} />
      <span className="text-foreground/80">{statusLabel(status)}</span>
    </Link>
  );
}

function PlanTab({ project, roles }: { project: EnvironmentProject; roles: ProjectRoles }) {
  const gt = useGT();
  const handleNewThread = useNewThreadHandler();
  const canWrite = useEnvironmentScope(project.environmentId, AuthFilesystemWriteScope);
  const write = useAtomCommand(projectEnvironment.writeFile, gt("Could not save the plan."));
  const readAtom = projectEnvironment.readFile({
    environmentId: project.environmentId,
    input: { cwd: project.workspaceRoot, relativePath: PLAN_FILE_NAME, allowMissing: true },
  });
  const result = useAtomValue(readAtom);
  const refreshRead = useAtomRefresh(readAtom);

  // Edits show right away; the file read catches up after the write lands.
  const [localSource, setLocalSource] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const fetched = AsyncResult.getOrElse(result, () => null);
  // Once the read returns what we wrote, drop the local copy so later edits by agents show.
  if (localSource !== null && !result.waiting && fetched?.contents === localSource) {
    setLocalSource(null);
  }
  const source = localSource ?? (fetched && fetched.exists !== false ? fetched.contents : null);

  const save = async (next: string) => {
    setLocalSource(next);
    const written = await write({
      environmentId: project.environmentId,
      input: { cwd: project.workspaceRoot, relativePath: PLAN_FILE_NAME, contents: next },
    });
    if (written._tag === "Success") refreshRead();
  };

  const startTask = async (task: PlanTask) => {
    if (source === null) return;
    const opened = await handleNewThread(scopeProjectRef(project.environmentId, project.id), {
      prompt: taskPrompt(task.text),
    });
    if (!opened) return;
    applyRoleModel(opened.draftId, roleModelSelection(roles, "builder"));
    await save(
      linkTaskThread(source, task.line, {
        environmentId: project.environmentId,
        threadId: opened.threadId,
      }),
    );
  };

  if (source === null) {
    if (result.waiting && fetched === null) {
      return <p className="p-6 text-muted-foreground text-sm">{gt("Loading plan…")}</p>;
    }
    return (
      <Empty className="flex-1">
        <EmptyHeader className="max-w-md">
          <EmptyTitle>
            <T>No plan yet</T>
          </EmptyTitle>
          <EmptyDescription>
            <T>
              The plan lives in PLAN.md at the project root, so you and your agents can both edit
              it.
            </T>
          </EmptyDescription>
        </EmptyHeader>
        <Button disabled={!canWrite} onClick={() => void save(emptyPlan(project.title))}>
          <T>Create PLAN.md</T>
        </Button>
      </Empty>
    );
  }

  const groups = parsePlan(source);
  const visibleGroups =
    // oxlint-disable-next-line t3code/no-untranslated-copy -- PLAN.md heading text, file content stays as written
    groups.length > 0 ? groups : [{ title: "Now", line: -1, tasks: [] }];

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6">
        <AskPlanner project={project} roles={roles} />
        <p className="text-muted-foreground text-xs">
          <T>
            Saved in PLAN.md at the project root. Start a task to open a thread for it; its status
            shows here.
          </T>
        </p>
        {visibleGroups.map((group) => {
          const key = `${group.line}:${group.title}`;
          const draft = drafts[key] ?? "";
          const submit = () => {
            if (draft.trim() === "") return;
            setDrafts((current) => ({ ...current, [key]: "" }));
            void save(addTask(source, group.title || "Now", draft));
          };
          return (
            <section key={key} className="flex flex-col gap-1">
              <h2 className="mb-1 font-semibold text-sm">{group.title || gt("Tasks")}</h2>
              {group.tasks.map((task) => (
                <div
                  key={task.line}
                  className="group flex min-h-9 items-center gap-2 rounded-md px-2 hover:bg-accent/40"
                >
                  <Checkbox
                    checked={task.done}
                    disabled={!canWrite}
                    aria-label={gt("Done")}
                    onCheckedChange={(checked) =>
                      void save(setTaskDone(source, task.line, checked === true))
                    }
                  />
                  <span
                    className={
                      task.done
                        ? "min-w-0 flex-1 text-muted-foreground text-sm line-through"
                        : "min-w-0 flex-1 text-sm"
                    }
                  >
                    {task.text}
                  </span>
                  {task.thread ? (
                    <TaskThreadStatus thread={task.thread} />
                  ) : task.done ? null : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canWrite}
                      onClick={() => void startTask(task)}
                    >
                      <PlayIcon />
                      <T>Start</T>
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost-destructive"
                    aria-label={gt("Remove task")}
                    disabled={!canWrite}
                    onClick={() => void save(removeTask(source, task.line))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2 px-2 pt-1">
                <PlusIcon className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={draft}
                  disabled={!canWrite}
                  placeholder={gt("Add a task")}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [key]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submit();
                  }}
                />
              </div>
            </section>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function ReviewTab({ project, roles }: { project: EnvironmentProject; roles: ProjectRoles }) {
  const handleNewThread = useNewThreadHandler();
  const threads = useBoardThreads(
    (thread) => thread.environmentId === project.environmentId && thread.projectId === project.id,
  );
  const ready = buildBoardColumns(threads).review;
  if (ready.length === 0) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyTitle>
            <T>Nothing to review</T>
          </EmptyTitle>
          <EmptyDescription>
            <T>Threads that finish their work in this project show up here.</T>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-5 py-6">
        {ready.map(({ thread }) => (
          <div
            key={thread.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <Link
                to="/$environmentId/$threadId"
                params={{ environmentId: thread.environmentId, threadId: thread.id }}
                className="truncate font-medium text-sm no-underline hover:underline"
              >
                {thread.title}
              </Link>
              <span className="truncate font-mono text-muted-foreground text-xs">
                {thread.branch ?? thread.modelSelection.model}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const opened = await handleNewThread(
                  scopeProjectRef(project.environmentId, project.id),
                  {
                    prompt: reviewPrompt(thread.title, thread.branch),
                    ...(thread.branch ? { branch: thread.branch } : {}),
                    ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
                  },
                );
                if (opened) applyRoleModel(opened.draftId, roleModelSelection(roles, "reviewer"));
              }}
            >
              <T>Get a second review</T>
            </Button>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

export function ProjectHomePage({
  environmentId,
  projectId,
  tab,
}: {
  environmentId: string;
  projectId: string;
  tab: ProjectHomeTab;
}) {
  const gt = useGT();
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  const project = useProject(
    scopeProjectRef(EnvironmentId.make(environmentId), ProjectId.make(projectId)),
  );
  const [roles, setRoles] = useProjectRoles(`${environmentId}:${projectId}`);
  const boardThreads = useBoardThreads(
    (thread) => thread.environmentId === environmentId && thread.projectId === projectId,
  );
  const selectTab = (next: ProjectHomeTab) =>
    void navigate({
      to: "/project/$environmentId/$projectId",
      params: { environmentId, projectId },
      search: { tab: next },
      replace: true,
    });

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <WorkspacePageHeader electron={isElectron} className="border-b">
          {project ? <ProjectFavicon project={project} className="size-4 shrink-0" /> : null}
          <h1 className="truncate font-medium text-sm">{project?.title ?? gt("Project")}</h1>
          <ToggleGroup
            aria-label={gt("Project view")}
            variant="segmented"
            value={[tab]}
            onValueChange={(next) => {
              const value = next[0];
              if (value === "plan" || value === "board" || value === "review") selectTab(value);
            }}
          >
            <Toggle value="plan">
              <T>Plan</T>
            </Toggle>
            <Toggle value="board">
              <T>Board</T>
            </Toggle>
            <Toggle value="review">
              <T>Review</T>
            </Toggle>
          </ToggleGroup>
          {project ? (
            <Button
              size="sm"
              variant="ghost"
              className="ms-auto"
              onClick={() =>
                void handleNewThread(scopeProjectRef(project.environmentId, project.id))
              }
            >
              <SquarePenIcon />
              <T>New thread</T>
            </Button>
          ) : null}
        </WorkspacePageHeader>
        {project === null ? (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyTitle>
                <T>Project not found</T>
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : tab === "plan" ? (
          <>
            <BotsBar project={project} roles={roles} onChange={setRoles} />
            <PlanTab project={project} roles={roles} />
          </>
        ) : tab === "board" ? (
          <BoardColumns threads={boardThreads} />
        ) : (
          <>
            <BotsBar project={project} roles={roles} onChange={setRoles} />
            <ReviewTab project={project} roles={roles} />
          </>
        )}
      </div>
    </SidebarInset>
  );
}
