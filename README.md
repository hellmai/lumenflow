# hellmai/os

HellmAI Operating System: LumenFlow workflow framework.

## Overview

This monorepo contains the open-source LumenFlow framework for AI-native software development workflows.

## Packages

- `@lumenflow/core` - Core WU lifecycle tools (wu:claim, wu:done, etc.)

## Requirements

- Node.js >= 22
- pnpm >= 9

## Getting Started

```bash
# Install dependencies
pnpm install

# Run linting
pnpm lint

# Run type checking
pnpm typecheck

# Run tests
pnpm test

# Build all packages
pnpm build
```

## Development

This project uses:

- **ESLint 9** with flat config for linting
- **Prettier 3.8** for code formatting
- **TypeScript 5.7** for type checking
- **Vitest 4** for testing
- **Turbo 2.7** for monorepo build orchestration

### Architecture

The framework follows hexagonal architecture principles. The ESLint boundaries plugin enforces:

- `ports` - Interface definitions (can only import from `shared`)
- `application` - Business logic (can import from `ports`, `shared`)
- `infrastructure` - External adapters (can import from `ports`, `shared`)
- `shared` - Common utilities (can only import from `shared`)

## License

Apache-2.0
