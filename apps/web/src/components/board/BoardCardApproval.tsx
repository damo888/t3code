import { useAtomValue } from "@effect/atom-react";
import { AuthOrchestrationOperateScope, type ScopedThreadRef } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { T, useGT } from "gt-react";
import { useState } from "react";

import { useEnvironmentScope } from "../../state/session";
import { environmentThreadDetails, threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { ComposerPendingApprovalActions } from "../chat/ComposerPendingApprovalActions";

/**
 * Mounted only for cards that report a pending approval, so the board subscribes to a
 * thread's detail just while it is asking.
 */
export function BoardCardApproval({ threadRef }: { threadRef: ScopedThreadRef }) {
  const pending = useAtomValue(environmentThreadDetails.pendingRequestsAtom(threadRef));
  const canRespond = useEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope);
  const respond = useAtomCommand(threadEnvironment.respondToApproval, { reportFailure: false });
  const gt = useGT();
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approval = pending?.approvals[0];
  if (!approval) return null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning-surface/60 p-2 text-xs">
      <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-foreground/90">
        {approval.detail || approval.requestKind}
      </pre>
      {approval.responseCapability === "live" ? (
        <div className="flex flex-wrap gap-1.5">
          <ComposerPendingApprovalActions
            presentation="inline"
            requestId={approval.requestId}
            isResponding={responding}
            canRespond
            disabled={!canRespond}
            options={approval.options}
            onRespondToApproval={async (requestId, decision) => {
              if (!canRespond || responding) return;
              setResponding(true);
              setError(null);
              const result = await respond({
                environmentId: threadRef.environmentId,
                input: { threadId: threadRef.threadId, requestId, decision },
              });
              if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
                const failure = squashAtomCommandFailure(result);
                setError(
                  failure instanceof Error
                    ? failure.message
                    : gt("Failed to submit approval decision."),
                );
              }
              setResponding(false);
              return result;
            }}
          />
        </div>
      ) : (
        <p className="text-warning-foreground">
          <T>Open the thread to respond.</T>
        </p>
      )}
      {(pending?.approvals.length ?? 0) > 1 ? (
        <p className="text-muted-foreground">
          <T>More requests are waiting in the thread.</T>
        </p>
      ) : null}
      {error !== null ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
