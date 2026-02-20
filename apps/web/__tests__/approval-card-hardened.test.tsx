// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ApprovalCard } from '../src/components/approval-card';
import { ApprovalQueue } from '../src/components/approval-queue';
import type { ApprovalRequestView } from '../src/lib/dashboard-types';
import { APPROVAL_STATUSES } from '../src/lib/dashboard-types';

// --- Test Helpers ---

function createApprovalRequest(overrides: Partial<ApprovalRequestView> = {}): ApprovalRequestView {
  return {
    receiptId: 'receipt-001',
    toolName: 'file_write',
    policyId: 'policy-fs-write',
    reason: 'Approval required for filesystem write',
    scopeRequested: [],
    scopeAllowed: [],
    status: APPROVAL_STATUSES.PENDING,
    ...overrides,
  };
}

// --- AC1: Deny action shows confirmation dialog ---

describe('AC1: Deny confirmation dialog', () => {
  it('does NOT call onDeny immediately when Deny is clicked', () => {
    const onDeny = vi.fn();
    const onApprove = vi.fn();
    const request = createApprovalRequest();

    render(<ApprovalCard request={request} onApprove={onApprove} onDeny={onDeny} />);

    const denyButton = screen.getByRole('button', { name: /deny/i });
    fireEvent.click(denyButton);

    // onDeny should NOT be called yet - confirmation should appear first
    expect(onDeny).not.toHaveBeenCalled();
  });

  it('shows a confirmation prompt after clicking Deny', () => {
    const onDeny = vi.fn();
    const onApprove = vi.fn();
    const request = createApprovalRequest();

    render(<ApprovalCard request={request} onApprove={onApprove} onDeny={onDeny} />);

    const denyButton = screen.getByRole('button', { name: /deny/i });
    fireEvent.click(denyButton);

    // Confirmation text should appear
    expect(screen.getByText(/are you sure/i)).toBeTruthy();
    // Confirm and Cancel buttons should appear
    expect(screen.getByRole('button', { name: /confirm deny/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('calls onDeny when Confirm Deny is clicked', () => {
    const onDeny = vi.fn();
    const onApprove = vi.fn();
    const request = createApprovalRequest({ receiptId: 'receipt-xyz' });

    render(<ApprovalCard request={request} onApprove={onApprove} onDeny={onDeny} />);

    fireEvent.click(screen.getByRole('button', { name: /deny/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm deny/i }));

    expect(onDeny).toHaveBeenCalledTimes(1);
    expect(onDeny).toHaveBeenCalledWith('receipt-xyz');
  });

  it('hides confirmation when Cancel is clicked', () => {
    const onDeny = vi.fn();
    const onApprove = vi.fn();
    const request = createApprovalRequest();

    render(<ApprovalCard request={request} onApprove={onApprove} onDeny={onDeny} />);

    fireEvent.click(screen.getByRole('button', { name: /deny/i }));
    expect(screen.getByText(/are you sure/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    // Confirmation text should be gone
    expect(screen.queryByText(/are you sure/i)).toBeNull();
    expect(onDeny).not.toHaveBeenCalled();
  });
});

// --- AC2: Approval queue shows pending count ---

describe('AC2: Approval queue shows pending count', () => {
  it('shows the count of pending approvals', () => {
    const requests: ApprovalRequestView[] = [
      createApprovalRequest({ receiptId: 'r-1', status: APPROVAL_STATUSES.PENDING }),
      createApprovalRequest({ receiptId: 'r-2', status: APPROVAL_STATUSES.PENDING }),
      createApprovalRequest({ receiptId: 'r-3', status: APPROVAL_STATUSES.APPROVED }),
    ];

    render(<ApprovalQueue requests={requests} onApprove={vi.fn()} onDeny={vi.fn()} />);

    // Should show "2" as pending count (2 pending out of 3)
    expect(screen.getByTestId('pending-count')).toBeTruthy();
    expect(screen.getByTestId('pending-count').textContent).toBe('2');
  });

  it('shows zero when no pending approvals exist', () => {
    const requests: ApprovalRequestView[] = [
      createApprovalRequest({ receiptId: 'r-1', status: APPROVAL_STATUSES.APPROVED }),
    ];

    render(<ApprovalQueue requests={requests} onApprove={vi.fn()} onDeny={vi.fn()} />);

    expect(screen.getByTestId('pending-count').textContent).toBe('0');
  });

  it('renders each pending approval card', () => {
    const requests: ApprovalRequestView[] = [
      createApprovalRequest({ receiptId: 'r-1', status: APPROVAL_STATUSES.PENDING }),
      createApprovalRequest({ receiptId: 'r-2', status: APPROVAL_STATUSES.PENDING }),
    ];

    render(<ApprovalQueue requests={requests} onApprove={vi.fn()} onDeny={vi.fn()} />);

    expect(screen.getByTestId('approval-card-r-1')).toBeTruthy();
    expect(screen.getByTestId('approval-card-r-2')).toBeTruthy();
  });
});

// --- AC3: Configurable approval timeout (default 30m) ---

describe('AC3: Configurable approval timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onTimeout after the default 30 minute timeout', () => {
    const onTimeout = vi.fn();
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const request = createApprovalRequest();

    render(
      <ApprovalCard
        request={request}
        onApprove={onApprove}
        onDeny={onDeny}
        timeoutMs={30 * 60 * 1000}
        onTimeout={onTimeout}
      />,
    );

    // Advance time to just before timeout
    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000 - 1);
    });
    expect(onTimeout).not.toHaveBeenCalled();

    // Advance to timeout
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledWith('receipt-001');
  });

  it('uses custom timeout duration when provided', () => {
    const onTimeout = vi.fn();
    const customTimeout = 5 * 60 * 1000; // 5 minutes

    render(
      <ApprovalCard
        request={createApprovalRequest()}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        timeoutMs={customTimeout}
        onTimeout={onTimeout}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(customTimeout);
    });

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not trigger timeout if no onTimeout is provided', () => {
    // Should not throw or trigger anything
    render(<ApprovalCard request={createApprovalRequest()} onApprove={vi.fn()} onDeny={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000); // 1 hour
    });

    // Component remains rendered without errors
    expect(screen.getByTestId('approval-card-receipt-001')).toBeTruthy();
  });

  it('clears timeout on unmount', () => {
    const onTimeout = vi.fn();

    const { unmount } = render(
      <ApprovalCard
        request={createApprovalRequest()}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        timeoutMs={30 * 60 * 1000}
        onTimeout={onTimeout}
      />,
    );

    unmount();

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    expect(onTimeout).not.toHaveBeenCalled();
  });
});

// --- AC4: All approval buttons have aria labels ---

describe('AC4: Approval buttons have aria labels', () => {
  it('Approve button has a descriptive aria-label', () => {
    const request = createApprovalRequest({ toolName: 'file_write' });

    render(<ApprovalCard request={request} onApprove={vi.fn()} onDeny={vi.fn()} />);

    const approveButton = screen.getByRole('button', { name: /approve/i });
    expect(approveButton.getAttribute('aria-label')).toBeTruthy();
    expect(approveButton.getAttribute('aria-label')).toContain('file_write');
  });

  it('Deny button has a descriptive aria-label', () => {
    const request = createApprovalRequest({ toolName: 'git_push' });

    render(<ApprovalCard request={request} onApprove={vi.fn()} onDeny={vi.fn()} />);

    const denyButton = screen.getByRole('button', { name: /deny/i });
    expect(denyButton.getAttribute('aria-label')).toBeTruthy();
    expect(denyButton.getAttribute('aria-label')).toContain('git_push');
  });

  it('Confirm Deny button has a descriptive aria-label', () => {
    const request = createApprovalRequest({ toolName: 'shell_exec' });

    render(<ApprovalCard request={request} onApprove={vi.fn()} onDeny={vi.fn()} />);

    // Click deny to show confirmation
    fireEvent.click(screen.getByRole('button', { name: /deny/i }));

    const confirmButton = screen.getByRole('button', { name: /confirm deny/i });
    expect(confirmButton.getAttribute('aria-label')).toBeTruthy();
  });

  it('Cancel button has a descriptive aria-label', () => {
    const request = createApprovalRequest();

    render(<ApprovalCard request={request} onApprove={vi.fn()} onDeny={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /deny/i }));

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    expect(cancelButton.getAttribute('aria-label')).toBeTruthy();
  });

  it('approval card container has an accessible role', () => {
    const request = createApprovalRequest();

    render(<ApprovalCard request={request} onApprove={vi.fn()} onDeny={vi.fn()} />);

    expect(screen.getByRole('article')).toBeTruthy();
  });
});
