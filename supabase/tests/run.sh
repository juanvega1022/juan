#!/usr/bin/env bash
# Runs the migration + RLS tests against a throwaway database.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
db="napkin_test_$$"
psql -q -c "create database $db"
trap 'psql -q -c "drop database $db"' EXIT
psql -q -d "$db" -v ON_ERROR_STOP=1 -o /dev/null \
  -f supabase/tests/auth_stub.sql \
  $(ls supabase/migrations/*.sql | sed 's/^/-f /') \
  -f supabase/tests/rls_test.sql
echo "All RLS tests passed."
