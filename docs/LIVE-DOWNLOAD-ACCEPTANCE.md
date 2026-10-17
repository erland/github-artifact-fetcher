# Live HTTPS handoff acceptance (separate from unit tests)

The existing `test/file-handoff-acceptance.test.mjs` tests byte-exact delivery and replay in-process. This **optional** workflow tests the deployed Coolify URL from an independent GitHub-hosted runner.

## Running securely

1. With the installed GitHub Artifact Fetcher MCP, call `fetch_repository_archive` for an allowed repository (for example `erland/github-artifact-fetcher`, branch `main`). The reply contains a fresh `downloadUrl`, `sha256`, `sizeBytes`, `mimeType` and `expiresAt`.
2. Put the **entire handoff JSON**, not just the URL, into the repository Actions secret `GHAF_E2E_HANDOFF_JSON`. **Do not put the URL in workflow dispatch inputs, GitHub issues, logs or pull request text.** This is a one-time bearer secret.
3. Immediately trigger **Actions → Live download handoff acceptance → Run workflow** on the deployed-compatible commit. Links expire after approximately 120 seconds; the workflow may be queued and fail if the link expires.
4. Inspect the Actions job: PASS means first HTTPS GET returned 200, payload size, SHA-256, checksum and MIME matched, and second GET was rejected with 404 or 410. The script never prints the link or bytes.
5. Delete or rotate the GitHub Actions secret after the run.

**Limitations:** This is not unattended: a dedicated service identity with OAuth token rotation or an authenticated production self-test endpoint would be required to mint links automatically from Actions. No such new privileged endpoint is introduced here. A stale link causes FAIL; CI is not marked green for the live test unless it actually succeeds. Expiration is separately covered by unit tests rather than waiting for an additional 120-second live token.

Local test can also run as `GHAF_HANDOFF_FILE=/path/to/descriptor.json node scripts/test-live-handoff.mjs` on a host that can reach the service.
