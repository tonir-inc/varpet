-- Run as a database administrator, connected to varpet:
-- psql -X -v ON_ERROR_STOP=1 -v ro_password=... -f this-file.sql
\set ON_ERROR_STOP on
\if :{?ro_password}
\else
  \echo 'Required: -v ro_password=...'
  \quit 1
\endif
BEGIN;
SELECT 'CREATE ROLE varpet_ro LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'varpet_ro')
\gexec
-- format %L quotes even passwords containing apostrophes; psql variables are not
-- interpolated inside dollar-quoted DO blocks.
SELECT format('ALTER ROLE varpet_ro LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L', :'ro_password')
\gexec
REVOKE ALL ON DATABASE varpet FROM varpet_ro;
REVOKE ALL ON SCHEMA public FROM varpet_ro;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM varpet_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM varpet_ro;
GRANT CONNECT ON DATABASE varpet TO varpet_ro;
GRANT USAGE ON SCHEMA public TO varpet_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO varpet_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE varpet IN SCHEMA public REVOKE ALL ON TABLES FROM varpet_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE varpet IN SCHEMA public GRANT SELECT ON TABLES TO varpet_ro;
COMMIT;
