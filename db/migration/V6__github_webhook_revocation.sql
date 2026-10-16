CREATE TABLE github_installation_users (
 installation_id BIGINT NOT NULL,
 user_subject TEXT NOT NULL,
 PRIMARY KEY (installation_id,user_subject)
);
CREATE TABLE github_webhook_deliveries (
 delivery_id UUID PRIMARY KEY,
 received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT SELECT,INSERT,DELETE ON github_installation_users,github_webhook_deliveries TO github_artifact_fetcher_app;
