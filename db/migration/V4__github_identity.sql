ALTER TABLE github_connections ADD COLUMN github_user_id BIGINT;
ALTER TABLE github_connections ADD COLUMN encrypted_refresh_token BYTEA;
ALTER TABLE github_connections ADD COLUMN token_expires_at TIMESTAMPTZ;
ALTER TABLE github_connections ADD COLUMN refresh_expires_at TIMESTAMPTZ;
CREATE UNIQUE INDEX github_connections_github_user_id_uq ON github_connections(github_user_id);
ALTER TABLE oauth_sessions ADD COLUMN session_hash TEXT;
CREATE UNIQUE INDEX oauth_sessions_session_hash_uq ON oauth_sessions(session_hash);
CREATE TABLE github_oauth_attempts (
 state_hash TEXT PRIMARY KEY,
 nonce_hash TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL
);
GRANT SELECT,INSERT,UPDATE,DELETE ON github_oauth_attempts TO github_artifact_fetcher_app;
