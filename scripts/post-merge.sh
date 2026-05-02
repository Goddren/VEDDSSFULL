#!/bin/bash
set -e
npm install
# Schema sync is handled automatically by the server on startup (server/index.ts)
# Do not run db:push here — drizzle-kit may not be installed in production
