# DEV-010 – GitHub App installation permissions and revoked access

## Implemented in PR #1
- A repository lookup is no longer accepted as sufficient proof of installation access.
- Validate repository identity (numeric ID and matching full name), then list installations accessible to the authenticated GitHub App user token.
- Only consider active, non-suspended installations with contents read or write permission; enumerate repositories accessible to the user under that installation and verify matching repository ID, full name and pull permission.
- Explicit limits: 10 installation pages and 10 repository pages per installation; all GitHub API requests use a 12-second timeout and reject redirects.
- GitHub API HTTP 401 triggers local revocation of the affected subject's encrypted GitHub connection, sessions, MCP access/refresh grants and pending consent requests in one PostgreSQL transaction.
- Negative tests cover revoked credentials, installation suspension, missing installation and per-user isolation.

## Remaining safety and acceptance limits
- GitHub App permissions and installation states are checked by GitHub API as available to a user access token. No independent GitHub App JWT/installation-token audit is performed.
- Other GitHub authorization errors, webhook-based installation uninstalls, refresh-revocation and temporary network failures require additional explicit handling policies.
- Live GitHub App installation checks remain unverified; mocked tests are not a substitute for deployment acceptance.
- No deployment has been performed.
