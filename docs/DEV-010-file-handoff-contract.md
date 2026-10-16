# DEV-010 – ChatGPT file handoff contract and acceptance suite

## Source documentation inspected (2026-10-16)

- OpenAI Plugins reference: https://developers.openai.com/plugins/reference – `window.openai.uploadFile(file,{library?})` uploads a **user-selected** file in an MCP Apps widget and returns `fileId`; `selectFiles` lets the widget choose existing user files; `getFileDownloadUrl({fileId})` obtains a download URL for a ChatGPT-hosted file. File parameters `_meta["openai/fileParams"]` are **inputs to tools**, not a documented server-to-user native attachment return type.
- OpenAI ChatGPT UI guide: https://developers.openai.com/plugins/build/chatgpt-ui – feature-detect ChatGPT-specific widget APIs.
- OpenAI plugin reference: https://developers.openai.com/plugins/reference – tool output schemas and MCP resource semantics.

**Conclusion:** No documented, general server-side MCP tool-result field has been verified that transforms arbitrary bytes downloaded from GitHub into a native ChatGPT conversation attachment. The optional widget upload API may support a UI-mediated workflow, but whether a server-fetched file can be uploaded without being user-selected and whether it appears as a conversation attachment MUST be demonstrated live before implementation claims support. Do not submit private GitHub assets to OpenAI or third-party storage without explicit user consent.

## Current contract, version 1

The `fetch_*` MCP tools for ZIP, PDF and EPUB now return text JSON matching this typed contract:

```json
{
  "schemaVersion": 1,
  "delivery": "one_time_https_url",
  "nativeAttachment": false,
  "filename": "report.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1234,
  "sha256": "<64 lowercase hex characters>",
  "downloadUrl": "https://<configured-domain>/downloads/<opaque-token>",
  "expiresAt": "<ISO 8601 timestamp>"
}
```

MIME is pinned by extension: ZIP `application/zip`, PDF `application/pdf`, EPUB `application/epub+zip`. Signature, checksum and declared byte length are verified before creating the temporary link. Unexpected filename extensions, MIME discrepancies, corrupt content, or insecure origins fail closed. The temporary link can only be redeemed once, expires after two minutes, and is an **unauthenticated bearer capability**: do not expose or log it, and note that link previews may consume it.

Release assets with formats or MIME declarations outside this strict contract are intentionally rejected until an explicit extension is accepted. ZIP validity remains enforced earlier by ZIP-specific validation; this handoff check is a transport identity/integrity check, not a full PDF/EPUB format validator.

## Reproducible local acceptance suite

`npm ci && npm run verify` includes `test/file-handoff-acceptance.test.mjs`, with deterministic fixtures for the three extension/MIME categories. It verifies:

1. Complete, versioned descriptor schema for ZIP, PDF, EPUB and `nativeAttachment=false`.
2. HTTPS URL, filename, MIME, exact downloaded bytes and SHA-256 matching the descriptor.
3. One-time redemption and expiry for each category.
4. Negative cases: wrong checksum, MIME mismatch, wrong binary signature, unsupported extension and HTTP origin.
5. Earlier source-specific tests prove GitHub Releases/Actions/repository ZIP structure and permission checks.

The local PDF and EPUB payloads are **transport fixtures** only. They do not prove full document rendering, EPUB conformance or ChatGPT attachment behavior.

## Live acceptance gates – deliberately NOT RUN

- Connect authorized plugin using real public HTTPS URL; verify OAuth and private repository access.
- For ZIP, PDF and EPUB, independently confirm true downloadable bytes, extension, MIME, SHA-256, expiry and one-time redemption.
- For **native ChatGPT attachments**, demonstrate that the downloaded file exists as an ordinary conversation file, can be reopened/downloaded in supported ChatGPT clients, and remains available according to ChatGPT's own retention semantics. Record the exact platform API or widget workflow used.
- A `resource_link`, JSON URL, `structuredContent` or a widget-only upload is **not automatically equivalent** to a native attachment.
- File delivery needs a privacy/security review for user consent and authenticated retrieval if direct platform upload is ever developed.

**Decision:** Release blocked pending external ChatGPT native handoff and real GitHub/Coolify integration acceptance. No deployment performed.
