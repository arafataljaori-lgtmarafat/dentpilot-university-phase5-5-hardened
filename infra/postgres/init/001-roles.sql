CREATE ROLE dentpilot_migrator
  LOGIN PASSWORD 'migration-development-only-change-me'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;

CREATE ROLE dentpilot_app
  LOGIN PASSWORD 'app-development-only-change-me'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;

ALTER DATABASE dentpilot OWNER TO dentpilot_migrator;
GRANT CONNECT ON DATABASE dentpilot TO dentpilot_app;
