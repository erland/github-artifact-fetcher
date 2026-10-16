CREATE TABLE mcp_oauth_consent_requests (
 request_hash TEXT PRIMARY KEY,
 csrf_hash TEXT NOT NULL,
 user_subject TEXT NOT NULL,
 client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id),
 redirect_uri TEXT NOT NULL,
 state TEXT NOT NULL,
 code_challenge TEXT NOT NULL,
 scope TEXT NOT NULL,
 resource TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ
);
CREATE INDEX mcp_oauth_consent_expiry_idx ON mcp_oauth_consent_requests(expires_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON mcp_oauth_consent_requests TO github_artifact_fetcher_app;
