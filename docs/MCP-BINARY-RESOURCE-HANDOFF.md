# MCP binary resources and manual download fallback

The existing `fetch_repository_archive`, `fetch_release_asset` and `fetch_workflow_artifact` tools keep their HTTPS one-time download descriptor. For files **up to 1 MiB** they additionally return a `resourceUri` such as `github-artifact-fetcher://files/<random-id>`.

An authenticated MCP client can request `resources/read` for that URI and receive a base64-encoded binary `blob` with the file's original MIME type. The server binds each resource to the GitHub account behind the MCP bearer token; another user cannot read it. Resources expire after two minutes, do not appear in public resource lists, and do not consume the independent HTTPS one-time download.

Files larger than 1 MiB have **no** resource URI. The user can open the existing `downloadUrl` in their own browser, download the ZIP/PDF/EPUB and then attach it manually to the ChatGPT conversation. The URL expires after about two minutes and works once, so it should be clicked promptly. Do not post these bearer URLs in public logs/issues.

The presence of `resourceUri` does **not** guarantee ChatGPT will expose `resources/read` to the assistant, ingest ZIP/PDF/EPUB, or attach the result as a native ChatGPT file. Those are separate client acceptances.

## Acceptance after release
1. Call `fetch_repository_archive` on a repository with a small ZIP (around 100 kB) and verify both `resourceUri` and `downloadUrl` are returned.
2. Attempt `resources/read` in ChatGPT. If exposed, verify blob MIME, byte count and SHA-256 after base64 decoding, without pasting encoded bytes into model context.
3. Confirm a different OAuth identity cannot retrieve the resource; confirm expiry.
4. For a file above 1 MiB, verify no `resourceUri` is advertised; use the existing link to download manually and upload the file to ChatGPT.
5. Validate that the one-time HTTPS link can only be used once, independent of `resources/read`.

No new HTTP endpoint or unauthenticated binary resource was added.
