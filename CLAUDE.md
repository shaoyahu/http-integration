# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Task Execution

Before starting any task, read all markdown files in `.claude/plan/` directory to check for related plans and context.

After completing each task, log key execution nodes (files modified, decisions made, important changes) to `.claude/log/{date}-{task-name}.md`. Use ISO date format for the filename (e.g., `2026-03-20-admin-feature.md`).

## Bug Handling

When encountering a bug, always check `.claude/bug/` directory first to see if the same or similar error has been documented before. If found, follow the existing bug fix and prevention measures.

## Project Overview

HTTP Client application with workflow automation. React + TypeScript frontend with Express.js backend. MongoDB for persistence, Zustand for state management.

## Architecture

```
src/
├── api/           # Axios-based HTTP client (src/api/http.ts)
├── components/    # Shared UI components (AppShell, Sidebar, RequestEditor)
├── constants/     # Shared constants (auth.ts, http.ts)
├── pages/         # Route-level components with permission-based access
├── store/         # Zustand stores (authStore, requestStore, workflowStore)
├── utils/         # Utility functions (requestPayload.ts, response.ts)
└── App.tsx        # React Router with permission-guarded routes

server/
├── index.js       # Express API server (ESM, port 4573)
└── mongo.js       # MongoDB connection management
```

## Key Patterns

### State Management (Zustand)
Stores use explicit interfaces with typed state and actions. Test files colocated: `workflowStore.test.ts`. Use `set()` with callback pattern for state updates (avoid direct `setState()` calls).

### Permission System
Routes guarded by `ProtectedRoute` component with `requiredPermissions`. Use `isAdminUser()` from `authStore` for admin checks. Constants defined in `src/constants/auth.ts`.

### Shared Utilities
- `HTTP_METHOD_COLORS` from `constants/http.ts` - HTTP method color mapping
- `formatResponseData`, `parseResponseData` from `utils/response.ts` - Response data utilities
- `applyPathMapping`, `parseBodyValue`, `setNestedValue` from `utils/requestPayload.ts` - Request payload utilities

### API Proxy
`POST /api/proxy` forwards HTTP requests with method, url, headers, body, params.

## Commands

```bash
npm run dev          # Start both Vite (port 62345) and Express (nodemon)
npm run dev:client   # Vite only
npm run dev:server   # Express with hot reload
npm run build        # Vite build + esbuild server
npm start            # Run production server from dist/server.js
npx vitest run       # Run all tests
npx vitest run src/store/workflowStore.test.ts  # Single test file
npx eslint src/      # Lint
npx tsc --noEmit     # Type check
```

## Server API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| POST | /api/proxy | Forward HTTP requests |
| GET/PUT | /api/requests-state | Persist request/folder state |
| GET/PUT | /api/workflows-state | Persist workflow state |
| GET | /api/workflow-requests | Available requests for workflows |
| POST | /api/auth/* | Authentication (login, register, logout) |
| GET/POST | /api/admin/* | Admin stats, user/identity management |

## MongoDB Collections

- `request_states` - Request/folder persistence (doc ID: `request_management_state`)
- `workflow_states` - Workflow persistence
- `users` - User accounts with hashed passwords (scrypt)
- `user_identities` - Role definitions
- `user_sessions` - Session tokens with 7-day expiry
- `permission_points` - Permission definitions

## Auth Flow

Session-based with cookie (`http_client_session`). Token is SHA256 hash of session ID stored in MongoDB. New users get default password `123456`.

## Environment Variables

Server reads from `.env` (dotenv). Vite exposes env vars with `VITE_` prefix to client.
