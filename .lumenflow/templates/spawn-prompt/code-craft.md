---
id: code-craft
name: Code Craft
required: true
order: 55
tokens: []
---

## Code Craft

Use these implementation standards while writing code:

1. **Extract repeated literals to named constants** (project-configured threshold in `eslint.config.mjs`).

```ts
// Before
if (status === 'in_progress') notify('in_progress');
if (nextStatus === 'in_progress') log('in_progress');
if (prevStatus === 'in_progress') audit('in_progress');

// After
const STATUS_IN_PROGRESS = 'in_progress';
if (status === STATUS_IN_PROGRESS) notify(STATUS_IN_PROGRESS);
```

2. **Write contextual error messages**: what failed, why, and how to fix it.

```ts
// Before
die('failed');

// After
die('Failed to parse workspace.yaml: missing lane field. Run pnpm lane:setup to regenerate.');
```

3. **Prefer existing libraries for common problems** (parsing, validation, dates, schema, paths) before custom code.

```ts
// Before
function parseDate(input: string) {
  /* custom parser */
}

// After
import { parseISO } from 'date-fns';
const parsed = parseISO(input);
```

4. **Use type narrowing instead of unsafe casts**.

```ts
// Before
const id = (payload as { id: string }).id;

// After
if (payload && typeof payload === 'object' && 'id' in payload) {
  const id = String(payload.id);
}
```

5. **Extract duplicated logic when it appears at your project's extraction threshold**.

```ts
// Before
if (mode === 'branch-pr') {
  /* ... */
}

// After
function isBranchPrMode(mode: string): boolean {
  return mode === 'branch-pr';
}
```

6. **Keep functions focused** (single responsibility).

```ts
// Before
function completeWuAndNotifyAndWriteAudit() {
  /* many responsibilities */
}

// After
function completeWu() {
  /* completion only */
}
function notifyCompletion() {
  /* notification only */
}
```

7. **Inject infrastructure dependencies into application logic**.

```ts
// Before
import { readFileSync } from 'node:fs';
function loadSpec(path: string) {
  return readFileSync(path, 'utf8');
}

// After
function loadSpec(path: string, readText: (p: string) => string) {
  return readText(path);
}
```
