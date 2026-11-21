CREATE SCHEMA IF NOT EXISTS projed_core AUTHORIZATION projed_owner_disposable;
CREATE SCHEMA IF NOT EXISTS projed_contract AUTHORIZATION projed_owner_disposable;

REVOKE ALL ON SCHEMA projed_core FROM PUBLIC;
REVOKE ALL ON SCHEMA projed_contract FROM PUBLIC;

CREATE TABLE projed_core.schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projed_core.runtime_metadata (
  id smallint PRIMARY KEY CHECK (id = 1),
  app_key text NOT NULL CHECK (app_key = 'projed'),
  kernel_contract_version integer NOT NULL CHECK (kernel_contract_version = 1),
  database_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO projed_core.runtime_metadata (id, app_key, kernel_contract_version, database_name)
VALUES (1, 'projed', 1, current_database());

REVOKE ALL ON ALL TABLES IN SCHEMA projed_core FROM PUBLIC;
GRANT USAGE ON SCHEMA projed_core TO projed_runtime_disposable;
GRANT SELECT ON projed_core.schema_migrations, projed_core.runtime_metadata TO projed_runtime_disposable;
