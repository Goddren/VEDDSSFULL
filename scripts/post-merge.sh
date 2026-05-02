#!/bin/bash
set -e
npm install
# Only push schema if DATABASE_URL is available
if [ -n "$DATABASE_URL" ] || [ -n "$PGHOST" ]; then
  npm run db:push || true
fi
