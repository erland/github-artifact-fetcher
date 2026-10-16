# GitHub Artifact Fetcher

System Builder CREATE — DEV-002 TypeScript/MCP baseline. **Not production ready.**

## Build and test

Node >=22; run `npm run build && npm test` (TypeScript compiler required). `npm start` exposes HTTP on port 3000 with `/health`, `/ready`, and a restricted `/mcp` JSON-RPC endpoint. It currently reports capabilities only, and does **not** download GitHub files. The DEV-001 PoC remains in `poc/` and can be exercised using `npm run test:poc`.

CI installs TypeScript and builds/tests/containerizes the project. The Dockerfile builds without access to the host's global `tsc`; therefore remote build requires npm registry reachability.

## Verification state

DEV-001 local transport passed; live ChatGPT output-file acceptance is deferred. DEV-002 implementation and 8/8 local tests passed; official MCP SDK integration, Docker and CI still require verification. See `docs/DEV-002.md` and `.system-builder/work-status.yaml`.

## Design

See `docs/functional-specification.md`, `docs/architecture.md`, `docs/development-plan.md`. Target remains OAuth-protected, read-only GitHub fetch service with standalone PostgreSQL database and automatic Flyway startup migrations (DEV-003). No deployment has been performed.
