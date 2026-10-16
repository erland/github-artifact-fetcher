# DEV-010 – OAuth registration and token revocation, no deployment

## Implemented
- Registration is fail-closed: `OAUTH_ALLOWED_REDIRECT_HOSTS` must list exact permitted callback hosts (comma separated). Without this setting, client registration is rejected. HTTPS/loopback redirect syntax validation remains mandatory.
- Added RFC 7009-style `POST /revoke`, advertised through OAuth discovery. It accepts `client_id` and opaque `token` and revokes unconsumed OAuth grants for the **same client and user subject**, including access and refresh tokens; a client cannot revoke grants belonging to another client through a token/client mismatch.
- Token hashes remain in PostgreSQL, and revocation updates are transactional.
- Reproducible CI tests verify token rotation followed by revocation, inability to use previously issued access tokens, and inability to refresh after revocation.
- Both `compose.yml` and `compose.coolify.yml` require the allowlist configuration.
- GitHub Actions run `38888704392` for implementation commit `d830ebda8d783418147ed133476838732fbb7974`: all tests and Docker build PASS.

## Important remaining restrictions
- Revocation is client/token-directed, and a full GitHub App installation uninstallation/revocation webhook is not implemented. Live permissions and revocation still require external acceptance.
- Register remains a dynamic public endpoint. Exact redirect-host allowlisting is an interim admission policy, not full client vetting or distributed abuse prevention.
- Repository checks rely on GitHub API responses but do not yet prove installation permission scopes or independently verify all GitHub App installations.
- Coolify is configuration only, not deployed.
- ChatGPT-native file handoff, real GitHub file downloads, distributed limits, ZIP structural integrity and production acceptance remain release blockers.

## Config
Example value: `OAUTH_ALLOWED_REDIRECT_HOSTS=chatgpt.com` **only if** the real OAuth client uses that callback hostname; verify actual redirect URIs before setting this. Avoid allowing wildcard hosts.
