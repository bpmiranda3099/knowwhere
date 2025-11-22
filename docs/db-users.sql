-- Run after the database is up to create RBAC-like users/roles.
-- Superuser from compose: knowwhere_superadmin / knowwhere_superadmin_pass

-- Create roles
CREATE ROLE knowwhere_admin LOGIN PASSWORD 'knowwhere_admin_pass';
CREATE ROLE knowwhere_ingest LOGIN PASSWORD 'knowwhere_ingest_pass';
CREATE ROLE knowwhere_reader LOGIN PASSWORD 'knowwhere_reader_pass';

-- Grant privileges
GRANT CONNECT ON DATABASE knowwhere TO knowwhere_admin, knowwhere_ingest, knowwhere_reader;
GRANT USAGE ON SCHEMA public TO knowwhere_admin, knowwhere_ingest, knowwhere_reader;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO knowwhere_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO knowwhere_admin;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO knowwhere_ingest;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO knowwhere_ingest;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO knowwhere_reader;

-- Ensure future tables/sequences inherit privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO knowwhere_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO knowwhere_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO knowwhere_ingest;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO knowwhere_ingest;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO knowwhere_reader;
