CREATE TABLE github_connections (
  id UUID PRIMARY KEY,
  user_subject TEXT NOT NULL UNIQUE,
  encrypted_token BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE oauth_sessions (
  id UUID PRIMARY KEY,
  user_subject TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX oauth_sessions_expires_at_idx ON oauth_sessions (expires_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON github_connections, oauth_sessions TO github_artifact_fetcher_app;
