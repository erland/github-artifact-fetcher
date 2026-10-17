# OAuth login and consent regression (ChatGPT)

The MCP client initiates `GET /authorize` with the registered redirect URI, OAuth state, resource and PKCE challenge. If no session exists, the server redirects to `/auth/github/start` preserving only an application-relative, bounded `/authorize?... ` path. GitHub login resumes the original request via an HMAC-authenticated, five-minute HttpOnly cookie; it does not accept an arbitrary post-login destination.

A signed resume cookie is validated against the application's encryption key; invalid or missing return state falls back to `/`. The existing GitHub state/nonce validation and OAuth code PKCE binding remain in place. Consent is server-side with single-use request and CSRF tokens. The display includes small responsive CSS (no scripts). Diagnostically, internal consent failures are logged as coarse categories only, never OAuth state, authorization codes, secrets, client tokens or cookies.

## Acceptance
1. New session: ChatGPT opens OAuth `/authorize`, browser moves to GitHub sign-in automatically, then returns to the same OAuth request and displays the consent page.
2. Click Approve **once** and verify a 302 to the registered ChatGPT redirect with the original state and a one-time authorization code.
3. Exchange with correct PKCE verifier succeeds once; wrong verifier and replay are rejected.
4. Deny returns `access_denied`, and invalid/tampered consent or missing cookie returns an error without issuing codes.
5. Without user login, any requested return path other than local `/authorize?` must be ignored.
6. Verify in a real ChatGPT browser context after a new GHCR release; local CI cannot reproduce ChatGPT's embedded browser cookie behavior.

No production deploy or live OAuth credentials were used in this change.
