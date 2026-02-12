# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React + TypeScript client code.
- `src/components/`: UI modules such as request/workflow editors.
- `src/pages/`: route-level pages (`HomePage`, `RequestPage`, `WorkflowPage`).
- `src/store/`: Zustand state stores and related tests.
- `src/api/`: HTTP client wrappers used by UI flows.
- `server/index.js`: Express proxy server (`/api/proxy`, `/api/health`).
- `public/`: static assets; `dist/`: build output (do not edit manually).

## Build, Test, and Development Commands
- `npm run dev`: starts client and server concurrently for local development.
- `npm run dev:client`: starts Vite dev server only.
- `npm run dev:server`: starts Node server with `nodemon`.
- `npm run build`: builds both client and server into `dist/`.
- `npm run build:client`: production client bundle with Vite.
- `npm run build:server`: bundles `server/index.js` with esbuild.
- `npm run start`: runs `dist/server.js`.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict` mode) for client, modern JS for server.
- Indentation: 2 spaces; keep semicolon usage consistent with file style.
- Components/pages/stores: `PascalCase` for React components, `camelCase` for functions/variables, `*.test.ts(x)` for tests.
- Use ESLint config in `eslint.config.js` (`@eslint/js`, `typescript-eslint`, `react-hooks`, `react-refresh`).
- Prefer small, focused modules; keep API request assembly in `src/api` or utility files.

## Testing Guidelines
- Test files exist under `src/pages/*.test.tsx` and `src/store/*.test.ts`.
- Follow descriptive `describe`/`it` names that explain behavior and edge cases.
- Add tests when changing workflow execution, parameter mapping, or store state transitions.
- Note: no dedicated `npm test` script is currently configured; add one with the chosen runner before enforcing CI coverage.

## Commit & Pull Request Guidelines
- Prefer Conventional Commit style seen in history, e.g. `feat: improve workflow routing`.
- Keep commits scoped to one concern (UI, store logic, proxy behavior, etc.).
- PRs should include:
  - what changed and why,
  - impacted paths (for example `src/pages/WorkflowPage.tsx`),
  - screenshots/GIFs for UI changes,
  - manual verification steps (`npm run dev`, `npm run build`).
