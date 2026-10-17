# Image-only Coolify deployment (migrations and app)

From the next release, GitHub Actions publishes two matching images:
- `ghcr.io/erland/github-artifact-fetcher:<version>`: Node MCP application
- `ghcr.io/erland/github-artifact-fetcher-migrations:<version>`: Flyway 11.18 with all SQL files embedded

`compose.coolify.yml` uses `GHAF_IMAGE_TAG` for **both**. The `migrate` service runs once, must succeed, and exits before `app` starts. No SQL bind mounts or local source checkout are required in containers.

## Before switching Coolify
1. Merge this PR, then publish a **new** release/tag, for example `v0.5.2`. Do not reuse `v0.5.0` or another already-published version: older tags don't contain the migrations image or OAuth fix.
2. Verify that the release workflow published **both** images with the same version and platform manifest (amd64/arm64). Confirm GHCR package access for Coolify; configure registry credentials if packages are private.
3. In Coolify select `compose.coolify.yml` and set `GHAF_IMAGE_TAG` to the new version, not `latest`.
4. Use the existing Postgres server with `DB_HOST`, optional `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_MIGRATION_USER`, `DB_MIGRATION_PASSWORD`. The migration role must own or have DDL rights; runtime may be read/write only.
5. Set `PUBLIC_BASE_URL`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `OAUTH_ALLOWED_REDIRECT_HOSTS`, `ENCRYPTION_KEY`. Keep secrets in Coolify and ensure GitHub OAuth callback matches the deployed HTTPS origin.
6. Deploy just one app replica. Verify migrate logs report **7** versioned SQL migrations for a fresh DB; `No migrations found` is an error, not an acceptable success. Validate `/health` and `/ready` responses.
7. Verify Traefik router and real TLS certificate separately (avoid resetting proxy certificate store). Test GitHub login and ChatGPT OAuth metadata.

## Failure handling
- Migration failure stops app startup via `service_completed_successfully`.
- Image Dockerfile verifies expected V1 and V7 files and at least seven migrations during build. Release CI independently checks the migration count. Runtime always reads baked-in SQL; a missing source bind mount cannot silently result in zero migrations.
- If DB readiness returns 503, check network access, credentials, and Flyway schema state; if TLS presents a default certificate, check Coolify domain routing and ACME independently.
- The OAuth PostgreSQL pool now uses the same DB_* configuration as all other pools.

**No images are published and no Coolify deployment is performed in the PR itself.**
