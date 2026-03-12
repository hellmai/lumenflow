# Agent Runtime Pack

The governed `agent-runtime` pack provides a host-driven agent loop with kernel-enforced tool gating.

Current scope:

- `agent:execute-turn` performs one provider-backed model turn and returns the governed turn contract
- `policy_factory` converts configured intents into kernel-enforced allow, deny, and `approval_required` rules
- `runGovernedAgentLoop()` shows how CLI, HTTP, or programmatic hosts can keep orchestration outside the pack while still feeding requested tools back through the kernel
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

## Host loop sketch

```ts
import {
  createApprovalResolutionMessage,
  createHostContextMessages,
  runGovernedAgentLoop,
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
