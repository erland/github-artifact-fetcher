CREATE TABLE mcp_oauth_clients (
 client_id TEXT PRIMARY KEY,
 redirect_uris JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE mcp_oauth_grants (
 grant_hash TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK (kind IN ('code','access','refresh')),
 client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id),
 user_subject TEXT NOT NULL,
 scope TEXT NOT NULL,
 resource TEXT NOT NULL,
 redirect_uri TEXT,
 code_challenge TEXT,
 expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ
);
CREATE INDEX mcp_oauth_grants_expiry_idx ON mcp_oauth_grants(expires_at);
GRANT SELECT,INSERT,UPDATE,DELETE ON mcp_oauth_clients,mcp_oauth_grants TO github_artifact_fetcher_app;
