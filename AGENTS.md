# Repository Guidelines

## Project Overview

HTTP Client application built with React + TypeScript frontend and Express.js backend server. Uses MongoDB for persistence and Zustand for client-side state management.

## Project Structure & Module Organization

```
src/
  components/   - Reusable UI components (AppShell, Sidebar, RequestEditor, etc.)
  pages/        - Route-level pages (HomePage, RequestPage, WorkflowPage, etc.)
  store/        - Zustand state stores with tests (*.test.ts)
  api/          - HTTP client wrappers and API functions
  constants/    - Static constants (auth roles, permissions)
  utils/        - Utility functions
  main.tsx      - React app entry point
  App.tsx       - Root component with routing

server/
  index.js      - Express server with MongoDB integration
  mongo.js      - MongoDB connection handling

public/         - Static assets
dist/           - Build output (do not edit manually)
```

## Build, Test, and Development Commands

### Development
```bash
npm run dev              # Starts both client (Vite) and server (nodemon) concurrently
npm run dev:client       # Vite dev server only on port 62345
npm run dev:server       # Express server with hot reload via nodemon
```

### Production Build
```bash
npm run build            # Builds client (Vite) and server (esbuild)
npm run build:client     # Production client bundle with Vite
npm run build:server     # Bundles server/index.js to dist/server.js
npm run start            # Runs production server from dist/server.js
```

### Testing

Tests use **Vitest** with React Testing Library. No dedicated test script exists in package.json.

```bash
# Run all tests
npx vitest run

# Run tests in watch mode
npx vitest

# Run a single test file
npx vitest run src/store/workflowStore.test.ts
npx vitest run src/pages/WorkflowPage.test.tsx

# Run tests with coverage
npx vitest run --coverage
```

Test file locations:
- `src/store/*.test.ts` - Store logic tests
- `src/pages/*.test.tsx` - Component integration tests
- `src/pages/*.integration.test.tsx` - Integration tests
- `src/pages/*.import.test.tsx` - Import/export tests

### Linting & Type Checking

```bash
npx eslint src/          # Run ESLint on source files
npx tsc --noEmit         # Type check without emitting files
```

TypeScript is configured in `tsconfig.json` which references:
- `tsconfig.app.json` - Client source (strict mode enabled)

## Code Style Guidelines

### Language & Formatting

- **TypeScript** for client code (`strict` mode enabled)
- **Modern JavaScript (ES2022)** for server code (ESM modules)
- **2 spaces** indentation
- **Semicolons**: Follow existing file style (no semicolons in store files ASK hemisemicolons in component files)
- **Line width**: Keep lines reasonable (~100 chars)

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| React Components | PascalCase | `RequestEditor`, `WorkflowPage` |
| Pages | PascalCase + Page suffix | `HomePage`, `RequestPage` |
| Stores | camelCase + Store suffix | `useRequestStore`, `useWorkflowStore` |
| Functions/Variables | camelCase | `fetchRequestState`, `handleAddInputField` |
| Constants | SCREAMING_SNAKE_CASE | `API_BASE_URL`, `SESSION_EXPIRE_MS` |
| Interfaces/Types | PascalCase | `HttpRequest`, `WorkflowRequest` |
| Test files | *.test.ts(x) | `workflowStore.test.ts` |
| Utility functions | camelCase | `formatResponseData`, `parseResponseData` |

### Imports Organization

Group imports logically:

```typescript
// 1. External dependencies
import React, { useEffect } from 'react'
import { Form, Input, Select, Button } from 'antd'
import { create } from 'zustand'

// 2. Internal modules - use relative paths
import { useRequestStore } from '../store/requestStore'
import { proxyRequest } from '../api/http'
import { applyPathMapping, parseBodyValue } from '../utils/requestPayload'
```

### TypeScript Guidelines

- Use **explicit type annotations** for function parameters and return types
- Define **interfaces** for data structures at module top or in dedicated type files
- Use **type imports** when only types are needed: `import type { HttpRequest } from '../store/requestStore'`
- Avoid `any`; use `unknown` with type guards when type is uncertain
- Export interfaces that may be reused: `export interface HttpRequest { ... }`

```typescript
// Good - explicit interface
export interface ProxyRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: any
  params?: Record<string, string>
}

// Good - typed function
export const proxyRequest = async (proxyReq: ProxyRequest): Promise<any> => {
  const response = await api.post('/proxy', proxyReq)
  return response.data
}
```

### React Component Patterns

- Use **function components** with hooks (no class components)
- Use **Ant Design** components for UI (`Form`, `Input`, `Select`, `Button`, `Card`, etc.)
- Use **Tailwind CSS** for styling with utility classes
- Destructure props and store hooks at component top

```typescript
export const RequestEditor: React.FC = () => {
  const { requests, selectedRequestId, updateRequest } = useRequestStore()
  const [testForm] = Form.useForm()
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  // ...
}
```

### State Management (Zustand)

- Define store interface with state and actions
- Use `create` from zustand
- Keep actions focused and atomic

```typescript
interface WorkflowStore {
  workflows: Workflow[]
  selectedWorkflowId: string | null
  addWorkflow: () => void
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void
  // ...
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  workflows: [],
  selectedWorkflowId: null,
  addWorkflow: () => set((state) => ({
    workflows: [...state.workflows, { /* new workflow */ }]
  })),
}))
```

### Error Handling

**Client-side:**
- Use Ant Design's `message.error()` for user-facing errors
- Use `message.success()` for success notifications
- Wrap async operations in try/catch

```typescript
try {
  const result = await proxyRequest({ url, method, headers, body, params })
  message.success('请求成功')
} catch (error: any) {
  message.error(error.response?.data?.message || error.message || '请求失败')
}
```

**Server-side:**
- Return structured error responses with HTTP status codes
- Include error code for programmatic handling

```javascript
if (!normalizedUsername) {
  return res.status(400).json({ 
    error: '用户名不能为空', 
    code: 'USERNAME_REQUIRED' 
  })
}
// For server errors
catch (error) {
  return res.status(500).json({
    error: 'Failed to load request state',
    details: error instanceof Error ? error.message : String(error),
  })
}
```

## Testing Guidelines

### Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

describe('Feature/Component Name', () => {
  beforeEach(() => {
    // Setup
  })

  describe('Specific behavior', () => {
    it('should describe expected behavior', async () => {
      // Arrange
      // Act
      // Assert
    })
  })
})
```

### Test Naming

- Use descriptive names explaining behavior and edge cases
- Start with `should` for behavioral tests
- Include context in describe blocks

```typescript
describe('Parameter Configuration', () => {
  it('should add input parameters to a workflow request', () => {})
  it('should validate parameter names', () => {})
})

describe('Error Handling', () => {
  it('should handle missing output parameters', async () => {})
})
```

### When to Add Tests

- When changing workflow execution logic
- When modifying parameter mapping or validation
- When updating store state transitions
- When adding new utility functions with complex logic

## Commit & Pull Request Guidelines

### Commit Messages

Use Conventional Commits format:
```
feat: add workflow execution with parameter passing
fix: resolve parameter validation edge case
refactor: extract response parsing to utility function
docs: update API configuration documentation
test: add tests for output parameter extraction
```

### Commit Scope

Keep commits focused on single concerns:
- UI changes only
- Store logic changes only
- Server endpoint changes only

### Pull Request Template

PRs should include:
- Summary of changes and rationale
- Affected paths (e.g., `src/pages/WorkflowPage.tsx`, `src/store/workflowStore.ts`)
- Screenshots/GIFs for UI changes
- Manual verification steps:
  ```bash
  npm run dev
  npm run build
  npx vitest run
  ```

## Server-Side Notes

- Server code uses **ESM** (`type: "module"` in package.json)
- Environment variables via `.env` (use dotenv)
- MongoDB connection required for most endpoints
- Authentication uses session cookies with token hash verification
- Password hashing uses scrypt with random salt
