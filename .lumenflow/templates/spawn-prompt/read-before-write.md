---
id: read-before-write
name: Read Before Write
required: true
order: 60
tokens: []
---

## Read Before Write

Understand the change before touching code:

1. Read each file you plan to edit from top to bottom.
2. Read adjacent files that define related types, helpers, and boundaries.
3. Find callers and dependents (for example with `rg`) before changing behavior.
4. Confirm acceptance criteria and code_paths still match your intended scope.
5. Never edit a file you have not read first.
6. If you cannot determine impact from reading alone, ask before proceeding.
