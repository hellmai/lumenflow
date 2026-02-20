'use client';

import type { ApprovalRequestView } from '../lib/dashboard-types';
import { APPROVAL_STATUSES } from '../lib/dashboard-types';
import { ApprovalCard } from './approval-card';

interface ApprovalQueueProps {
  readonly requests: readonly ApprovalRequestView[];
  readonly onApprove: (receiptId: string) => void;
  readonly onDeny: (receiptId: string) => void;
  /** Timeout in milliseconds for each approval card. */
  readonly timeoutMs?: number;
  /** Called when an approval request times out. */
  readonly onTimeout?: (receiptId: string) => void;
}

export function ApprovalQueue({
  requests,
  onApprove,
  onDeny,
  timeoutMs,
  onTimeout,
}: ApprovalQueueProps) {
  const pendingCount = requests.filter((r) => r.status === APPROVAL_STATUSES.PENDING).length;

  return (
    <section aria-label="Approval queue">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Pending Approvals</h2>
        <span
          data-testid="pending-count"
          className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white"
        >
          {pendingCount}
        </span>
      </div>

      <div className="space-y-3">
        {requests
          .filter((r) => r.status === APPROVAL_STATUSES.PENDING)
          .map((request) => (
            <ApprovalCard
              key={request.receiptId}
              request={request}
              onApprove={onApprove}
              onDeny={onDeny}
              timeoutMs={timeoutMs}
              onTimeout={onTimeout}
            />
          ))}
      </div>
    </section>
  );
}
