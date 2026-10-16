# DEV-010 – Release preparation and acceptance checklist (NO DEPLOYMENT)

## Automated checks
- `npm ci && npm run verify` on Node 22
- PostgreSQL 17 + Flyway migrate, validate and migration rerun
- `docker build` from committed lockfile
- Negative OAuth consent/CSRF tests and one-time binary URL transport tests
- Run via GitHub Actions on PR #1; record the verified implementation SHA and CI run.

## Critical remaining manual acceptance gates (block deployment/release)
- Run live MCP OAuth authorization in ChatGPT with real GitHub App and consent.
- Verify real private repository Release PDF/EPUB, Actions ZIP and archive ZIP downloads.
- Prove the actual native ChatGPT attachment experience. Returning an HTTPS link or MCP resource_link does **not** meet this gate.
- Verify Coolify reverse proxy, TLS, PUBLIC_BASE_URL, database migration fail-closed and secret injection with a controlled staging deployment, only when explicitly authorized.
- Verify authorization revocation, key rotation, rate limiting across replicas, audit retention, archive safety and CDN behavior.
- The temporary download cache is per process (16 entries, 2 minutes, 20 MiB per file): sticky routing/single instance is necessary until replaced by durable shared storage.
- Signed single-use unguessable HTTPS URL is a bearer capability: do not log, cache, or share it. It is not authenticated at retrieval time and does not constitute native ChatGPT transfer.

## Deployment configuration
Use `compose.coolify.yml` as a proposed Coolify configuration, not a live deployment. PostgreSQL runs in the existing independent instance; no PostgreSQL container in Compose. Configure secrets through Coolify rather than in repository files. Make sure the migration task runs successfully before app starts.
