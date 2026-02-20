'use client';

import { useEffect, useRef, useState } from 'react';
import type { ApprovalRequestView } from '../lib/dashboard-types';

const APPROVAL_SECTION = {
  SCOPE_REQUESTED: 'Requested Scope',
  SCOPE_ALLOWED: 'Allowed Scope',
  POLICY: 'Policy',
} as const;

interface ApprovalCardProps {
  readonly request: ApprovalRequestView;
  readonly onApprove: (receiptId: string) => void;
  readonly onDeny: (receiptId: string) => void;
  /** Timeout in milliseconds before onTimeout fires. Only active when onTimeout is provided. */
  readonly timeoutMs?: number;
  /** Called when the approval request times out. */
  readonly onTimeout?: (receiptId: string) => void;
}

export function ApprovalCard({
  request,
  onApprove,
  onDeny,
  timeoutMs,
  onTimeout,
}: ApprovalCardProps) {
  const [showDenyConfirmation, setShowDenyConfirmation] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AC3: Configurable approval timeout
  useEffect(() => {
    if (timeoutMs == null || onTimeout == null) {
      return;
    }

    timerRef.current = setTimeout(() => {
      onTimeout(request.receiptId);
    }, timeoutMs);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [timeoutMs, onTimeout, request.receiptId]);

  const handleDenyClick = (): void => {
    setShowDenyConfirmation(true);
  };

  const handleConfirmDeny = (): void => {
    setShowDenyConfirmation(false);
    onDeny(request.receiptId);
  };

  const handleCancelDeny = (): void => {
    setShowDenyConfirmation(false);
  };

  return (
    <article
      data-testid={`approval-card-${request.receiptId}`}
      className="rounded-lg border border-amber-300 bg-amber-50 p-4"
      aria-label={`Approval request for ${request.toolName}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-amber-800">{request.toolName}</p>
          <p className="mt-1 text-xs text-amber-700">{request.reason ?? 'Approval required.'}</p>
        </div>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
          pending
        </span>
      </div>

      <div className="mt-3 space-y-2 text-xs text-amber-900">
        <div>
          <span className="font-semibold">{APPROVAL_SECTION.POLICY}: </span>
          <span className="font-mono">{request.policyId}</span>
        </div>

        {request.scopeRequested.length > 0 && (
          <div>
            <p className="font-semibold">{APPROVAL_SECTION.SCOPE_REQUESTED}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {request.scopeRequested.map((scope) => (
                <span
                  key={`requested-${request.receiptId}-${scope.type}-${scope.pattern ?? ''}-${scope.access ?? ''}`}
                  className="rounded bg-amber-100 px-2 py-0.5"
                >
                  {scope.type} {scope.pattern ?? ''} {scope.access ?? ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {request.scopeAllowed.length > 0 && (
          <div>
            <p className="font-semibold">{APPROVAL_SECTION.SCOPE_ALLOWED}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {request.scopeAllowed.map((scope) => (
                <span
                  key={`allowed-${request.receiptId}-${scope.type}-${scope.pattern ?? ''}-${scope.access ?? ''}`}
                  className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-900"
                >
                  {scope.type} {scope.pattern ?? ''} {scope.access ?? ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AC1: Deny confirmation dialog */}
      {showDenyConfirmation ? (
        <div className="mt-4 rounded border border-red-300 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-800">
            Are you sure you want to deny this action?
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              aria-label={`Confirm deny for ${request.toolName}`}
              className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              onClick={handleConfirmDeny}
            >
              Confirm Deny
            </button>
            <button
              type="button"
              aria-label="Cancel deny action"
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              onClick={handleCancelDeny}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2">
          {/* AC4: All approval buttons have aria labels */}
          <button
            type="button"
            aria-label={`Approve ${request.toolName}`}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            onClick={() => onApprove(request.receiptId)}
          >
            Approve
          </button>
          <button
            type="button"
            aria-label={`Deny ${request.toolName}`}
            className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            onClick={handleDenyClick}
          >
            Deny
          </button>
        </div>
      )}
    </article>
  );
}
