# Agent Runtime Pack

The governed `agent-runtime` pack provides a host-driven agent loop with kernel-enforced tool gating.

Current scope:

- `agent:execute-turn` performs one provider-backed model turn and returns the governed turn contract
- `policy_factory` converts configured intents into kernel-enforced allow, deny, and `approval_required` rules
- `runGovernedAgentLoop()` shows how CLI, HTTP, or programmatic hosts can keep orchestration outside the pack while still feeding requested tools back through the kernel
- `startGovernedAgentSession()` and `resumeGovernedAgentSession()` persist linear session state for long-running governed turns
- `startGovernedAgentWorkflow()` and `resumeGovernedAgentWorkflow()` add pack-owned branch, join, and scheduled-wakeup orchestration inside the same `agent-session`
- `createHostContextMessages()` lets a host add task and memory context without depending on any other pack's storage internals

## Config shape

```yaml
agent_runtime:
  default_model: default
  models:
    default:
      provider: openai_compatible
      model: demo-model
      api_key_env: AGENT_RUNTIME_API_KEY
      base_url_env: AGENT_RUNTIME_BASE_URL
  intents:
    scheduling:
      description: Schedule or reschedule work
      allow_tools:
        - calendar:create-event
      approval_required_tools:
        - calendar:create-event
```

## Orchestration boundary

The kernel remains responsible for:

- tool execution
- policy evaluation
- scope enforcement
- evidence receipts for every governed tool call

The pack owns only `agent-session` orchestration concerns:

- persisted session and workflow state under `.agent-runtime/workflow/`
- branch and join readiness
- scheduled wakeups for routine-style follow-up nodes
- workflow-level continuation records that explain why the next governed turn ran

This keeps scheduled and resumed execution inside the existing `agent-session` task model rather than inventing a new execution class.

## Host loop sketch

```ts
import {
  createApprovalResolutionMessage,
  createHostContextMessages,
  runGovernedAgentLoop,
  resumeGovernedAgentWorkflow,
  startGovernedAgentWorkflow,
} from '@lumenflow/packs-agent-runtime';

const seedMessages = [
  ...createHostContextMessages({
    task_summary: 'Reschedule the weekly review.',
    memory_summary: 'The reviewer prefers mornings.',
  }),
  { role: 'user', content: 'Please sort out the next slot.' },
];

const result = await runGovernedAgentLoop({
  runtime,
  executeTurnInput: {
    session_id: executionContext.session_id,
    model_profile: 'default',
    url: 'https://model-provider.invalid/',
    messages: seedMessages,
  },
  createContext: (metadata) => ({
    ...executionContext,
    metadata,
  }),
});

if (result.kind === 'approval_required') {
  await runtime.resolveApproval({
    request_id: result.pending_request_id,
    approved: true,
    approved_by: 'operator@example.com',
  });

  const approvalMessage = createApprovalResolutionMessage({
    requestId: result.pending_request_id,
    approved: true,
    approvedBy: 'operator@example.com',
    toolName: result.requested_tool.name,
  });

  // Append approvalMessage to the next execute-turn call and continue the loop.
}
```

The pack keeps tool gating in the kernel. Hosts only decide when to start the loop, when to resolve approvals, and what external context to inject into the conversation.

## Workflow sketch

```ts
const workflow = await startGovernedAgentWorkflow({
  runtime,
  storageRoot: workspaceRoot,
  workflow: {
    session_id: executionContext.session_id,
    nodes: [
      {
        id: 'collect',
        execute_turn_input: {
          session_id: executionContext.session_id,
          model_profile: 'default',
          url: 'https://model-provider.invalid/',
          messages: [{ role: 'user', content: 'Collect the constraints.' }],
        },
      },
      {
        id: 'follow-up',
        depends_on: ['collect'],
        wake_at: '2026-03-13T09:00:00.000Z',
        execute_turn_input: {
          session_id: executionContext.session_id,
          model_profile: 'default',
          url: 'https://model-provider.invalid/',
          messages: [{ role: 'user', content: 'Perform the scheduled follow-up.' }],
        },
      },
    ],
  },
  createContext: (metadata) => ({ ...executionContext, metadata }),
});

if (workflow.kind === 'scheduled') {
  await resumeGovernedAgentWorkflow({
    runtime,
    storageRoot: workspaceRoot,
    sessionId: executionContext.session_id,
    createContext: (metadata) => ({ ...executionContext, metadata }),
  });
}
```
