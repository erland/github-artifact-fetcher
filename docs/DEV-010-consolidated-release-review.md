# DEV-010 – Consolidated release review (no deployment)

## Decision
**NOT READY FOR RELEASE.** Static security work is substantially complete, but live platform acceptance remains blocked.

## Verified source-level controls
- OAuth PKCE, server-side single-use consent, redirect-host allowlist, token revocation and GitHub App install-level permissions.
- Signed webhook delivery and replay ledger, per-subject revocation, retention runner, ZIP structure/CRC/decompression checks, resource bounds and ephemeral HTTPS transport.
- This review fixes the ZIP overlap check from quadratic to sort-and-scan and rejects ambiguous leading bytes/unaccounted data.

## ChatGPT-native file handoff – assessment
- Current MCP tools return JSON metadata and a one-use HTTPS URL. This is **not** a native attachment.
- MCP `resource_link` is a protocol link to a resource; specification support does **not** imply that ChatGPT imports it as a downloadable conversation file.
- `structuredContent`, `resource_link`, a web URL and Base64 text are different representations; none is independently proven to yield a native ChatGPT conversation attachment in the target client.
- An OpenAI-specific file-output extension/host capability, if documented and supported in the intended plugin runtime, should be evaluated with an actual fixture rather than invented or inferred from generic MCP. Avoid claiming support until a live end-to-end test produces a ChatGPT-native attachment.
- Recommended fallback if no compatible host-side attachment mechanism exists: transparently return an authenticated or single-use download link with verified MIME, checksum, size, filename, short TTL and explicit caveat. This meets **link-delivery**, not **native-file-delivery**.
- Externally fetched private ZIP/PDF/EPUB should not be silently handed to third-party storage/providers.

## Release acceptance matrix
| Gate | Pass condition | Current |
|---|---|---|
| CI | Build, PostgreSQL migrations, full tests, Docker | automated, re-verify at final SHA |
| GitHub OAuth | Real ChatGPT redirect + PKCE, consent, session revocation | NOT TESTED |
| GitHub App permissions | Private repo allowed/denied, suspended/uninstalled, user isolation | Mocked only |
| Releases | Real private PDF, EPUB and ZIP, checksums correct | NOT TESTED |
| Actions | Real run artifact, expiry and CDN redirects | NOT TESTED |
| Repository archives | Real branch/tag/commit ZIP and compatibility | NOT TESTED |
| Native attachment | A PDF/EPUB/ZIP appears as true ChatGPT file attachment and is readable/downloadable | NOT TESTED |
| Link fallback | Single-use link over public TLS, expiry, one-use, download integrity | Mocked only |
| Coolify | Secrets, database migrations, TLS, restart and correct proxy routing | NOT DEPLOYED |
| Operations | Distributed abuse control, monitoring, retention job scheduling and failure recovery | OPEN |

## Observed release blockers
- No live acceptance of native ChatGPT attachment contract.
- No independent production-like GitHub App/OAuth/webhook/CDN validation.
- Instance-local rate limiting and temporary file cache; multi-replica needs shared-store or single-instance operational constraint.
- Coolify staging/proxy/migration startup not performed, per user instruction.
- Strict ZIP support rejects ZIP64/data descriptors and nonstandard compression; verify against actual GitHub artifacts.

## Explicit staging acceptance plan, only when authorized
1. Configure a disposable test repository and least-privilege GitHub App, with webhook secret and callback.
2. Run real OAuth and repository permission positive/negative flows, then token and webhook revocation.
3. Fetch fixture PDF, EPUB, Release ZIP, Actions ZIP and branch/tag/commit archives; independently verify digests/bytes.
4. Test native attachment behavior with the intended ChatGPT plugin/client, not merely in unit tests.
5. Verify controlled Coolify startup, TLS, migration idempotence, bounded memory, logging and rollback.
6. Do not move the release gate to PASS if any native file handoff or platform capability remains unsupported.

No deployment performed.
