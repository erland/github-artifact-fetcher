# GitHub Artifact Fetcher

Read-only GitHub MCP connector for release assets, repository archives and GitHub Actions artifacts.

## Delivery policy

- For release files up to **256 KiB** (262,144 bytes), use `get_small_release_asset`. The file is returned as base64 MCP binary content. This is **not** a native ChatGPT attachment, and large MCP binary outputs are intentionally avoided.
- For larger release files, use `list_release_assets` and its `githubUrl` link. The user downloads the original file from GitHub and attaches it to ChatGPT if needed. The service does **not** download the binary merely to discover it is too large.
- Repository archives: `get_repository_archive_link` returns a commit-pinned GitHub archive URL without downloading the archive. The older `fetch_repository_archive` returns that URL too.
- Actions artifacts: `list_workflow_artifacts` returns a GitHub Actions run-page link (not a direct binary download URL). The older `fetch_workflow_artifact` stages files no larger than 256 KiB and returns the GitHub page for larger files.
- `fetch_release_asset` and `read_small_file` remain for two-step legacy integrations, capped at 256 KiB for the returned MCP binary; release assets larger than that return `githubUrl` without downloading bytes.

GitHub links also work for private repositories when the user is signed in to GitHub and has permission. GitHub Actions artifacts may require navigating to the workflow run.

The temporary HTTPS staging endpoint is retained for compatibility, but it is no longer used by any ChatGPT Library widget. Library-upload experimentation and its CORS test flags have been removed.

## Build and test

Node.js 22 or later.

```sh
npm ci
npm run verify
```

The service uses `/health`, `/ready` and `/mcp`, and requires configured authentication and database settings in production.
