CREATE TABLE IF NOT EXISTS service_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO service_metadata (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT ON service_metadata TO github_artifact_fetcher_app;
