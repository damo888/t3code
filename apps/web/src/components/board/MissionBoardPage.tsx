import { Link } from "@tanstack/react-router";
import { T, useGT, Var } from "gt-react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  GitBranchIcon,
  CircleDotDashedIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  scopedProjectKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";

import { isElectron } from "../../env";
import { useNowMinute } from "../../hooks/useNowMinute";
import { cn } from "../../lib/utils";
import { useDelegatedUnderParent, useProjects, useVisibleThreadShells } from "../../state/entities";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { ProjectFavicon } from "../ProjectFavicon";
import { filterSidebarV2VisibleThreads, type SidebarThreadStatus } from "../Sidebar.logic";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { BoardCardApproval } from "./BoardCardApproval";
import {
  BOARD_COLUMNS,
  buildBoardColumns,
  type BoardCard,
  type BoardColumn,
} from "./missionBoard.logic";

const COLUMN_ACCENT: Record<BoardColumn, string> = {
  "needs-you": "bg-warning",
  running: "bg-info",
  review: "bg-success",
  done: "bg-muted-foreground/40",
};

export function StatusGlyph({ status }: { status: SidebarThreadStatus }) {
  switch (status) {
    case "approval":
      return <ShieldQuestionIcon className="size-3.5 text-warning" />;
    case "input":
    case "request":
      return <MessageCircleQuestionIcon className="size-3.5 text-warning" />;
    case "failed":
    case "limited":
      return <CircleAlertIcon className="size-3.5 text-destructive" />;
    case "preparing":
    case "working":
      return <CircleDotDashedIcon className="size-3.5 text-info" />;
    case "waiting":
      return <CircleDashedIcon className="size-3.5 text-info" />;
    case "ready":
      return <CircleCheckIcon className="size-3.5 text-success" />;
  }
}

export function useStatusLabel() {
  const gt = useGT();
  return (status: SidebarThreadStatus): string => {
    switch (status) {
      case "approval":
        return gt("Wants approval");
      case "input":
        return gt("Has a question");
      case "request":
        return gt("Guest is waiting");
      case "failed":
        return gt("Failed");
      case "limited":
        return gt("Hit a usage limit");
      case "preparing":
        return gt("Starting");
      case "working":
        return gt("Working");
      case "waiting":
        return gt("Waiting on background work");
      case "ready":
        return gt("Finished");
    }
  };
}

function BoardCardView({
  card,
  project,
  now,
  statusLabel,
}: {
  card: BoardCard;
  project: EnvironmentProject | undefined;
  now: number;
  statusLabel: string;
}) {
  const { thread } = card;
  const model = thread.modelSelection.model;
  const provider = thread.runtime?.providerName ?? null;
  const updated = formatRelativeTimeLabel(thread.runtime?.updatedAt ?? thread.updatedAt, now);
  return (
    <article className="relative flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground shadow-xs/5 transition-colors focus-within:border-ring hover:border-ring/60 hover:bg-accent/40">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {project ? <ProjectFavicon project={project} className="size-3.5 shrink-0" /> : null}
        {project ? (
          <Link
            to="/project/$environmentId/$projectId"
            params={{ environmentId: project.environmentId, projectId: project.id }}
            search={{ tab: "plan" }}
            className="relative z-10 truncate no-underline hover:text-foreground hover:underline"
          >
            {project.title}
          </Link>
        ) : null}
        <span className="ms-auto shrink-0 tabular-nums">{updated}</span>
      </div>
      {/* The title link stretches over the whole card; the approval block sits above it. */}
      <Link
        to="/$environmentId/$threadId"
        params={{ environmentId: thread.environmentId, threadId: thread.id }}
        className="line-clamp-2 font-medium text-sm leading-snug no-underline after:absolute after:inset-0 after:rounded-lg focus-visible:outline-hidden"
      >
        {thread.title}
      </Link>
      <div className="flex items-center gap-1.5 text-xs">
        <StatusGlyph status={card.status} />
        <span className="text-foreground/80">{statusLabel}</span>
      </div>
      {card.status === "approval" ? (
        <div className="relative z-10">
          <BoardCardApproval threadRef={scopeThreadRef(thread.environmentId, thread.id)} />
        </div>
      ) : null}
      {card.status === "failed" && thread.runtime?.lastError ? (
        <div className="line-clamp-2 rounded-md bg-error-surface px-2 py-1 text-error-foreground text-xs">
          {thread.runtime.lastError}
        </div>
      ) : null}
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
        <span className="truncate font-mono">{provider ? `${provider} · ${model}` : model}</span>
        {thread.branch ? (
          <span className="ms-auto flex min-w-0 items-center gap-1">
            <GitBranchIcon className="size-3 shrink-0" />
            <span className="truncate font-mono">{thread.branch}</span>
          </span>
        ) : null}
      </div>
    </article>
  );
}

function BoardColumnView({
  title,
  hint,
  accent,
  count,
  children,
}: {
  title: ReactNode;
  hint: ReactNode;
  accent: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 w-[19rem] shrink-0 flex-col rounded-xl bg-muted/40 md:w-auto md:min-w-0 md:flex-1">
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className={cn("size-2 rounded-full", accent)} />
        <h2 className="font-semibold text-sm">{title}</h2>
        <span className="rounded-full bg-background px-1.5 text-muted-foreground text-xs tabular-nums">
          {count}
        </span>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 px-3 pb-3">
          {count === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
              {hint}
            </p>
          ) : (
            children
          )}
        </div>
      </ScrollArea>
    </section>
  );
}

export function useBoardThreads(
  filter?: (thread: EnvironmentThreadShell) => boolean,
): EnvironmentThreadShell[] {
  const shells = useVisibleThreadShells();
  const delegated = useDelegatedUnderParent();
  const visible = filterSidebarV2VisibleThreads(shells, null, delegated);
  return filter ? visible.filter(filter) : visible;
}

export function BoardColumns({ threads }: { threads: ReadonlyArray<EnvironmentThreadShell> }) {
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const projects = useProjects();
  const statusLabel = useStatusLabel();
  const projectByKey = new Map(
    projects.map((project) => [
      scopedProjectKey(scopeProjectRef(project.environmentId, project.id)),
      project,
    ]),
  );
  const columns = buildBoardColumns(threads);
  const meta: Record<BoardColumn, { title: ReactNode; hint: ReactNode }> = {
    "needs-you": {
      title: <T>Needs you</T>,
      hint: <T>Nothing is waiting on you.</T>,
    },
    running: {
      title: <T>Running</T>,
      hint: <T>No agents are working right now.</T>,
    },
    review: {
      title: <T>Ready to review</T>,
      hint: <T>Finished work shows up here.</T>,
    },
    done: {
      title: <T>Done</T>,
      hint: <T>Settled threads land here.</T>,
    },
  };
  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
      {BOARD_COLUMNS.map((column) => (
        <BoardColumnView
          key={column}
          title={meta[column].title}
          hint={meta[column].hint}
          accent={COLUMN_ACCENT[column]}
          count={columns[column].length}
        >
          {columns[column].map((card) => (
            <BoardCardView
              key={`${card.thread.environmentId}:${card.thread.id}`}
              card={card}
              project={projectByKey.get(
                scopedProjectKey(scopeProjectRef(card.thread.environmentId, card.thread.projectId)),
              )}
              now={now}
              statusLabel={statusLabel(card.status)}
            />
          ))}
        </BoardColumnView>
      ))}
    </div>
  );
}

export function MissionBoardPage() {
  const threads = useBoardThreads();
  const waiting = buildBoardColumns(threads)["needs-you"].length;
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <WorkspacePageHeader electron={isElectron} className="border-b">
          <h1 className="truncate font-medium text-sm">
            <T>Board</T>
          </h1>
          <span className="text-muted-foreground text-xs">
            {waiting > 0 ? (
              <T>
                <Var>{waiting}</Var> waiting on you
              </T>
            ) : null}
          </span>
        </WorkspacePageHeader>
        <BoardColumns threads={threads} />
      </div>
    </SidebarInset>
  );
}
