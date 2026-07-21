#!/bin/bash
set -euo pipefail

node dist/apply-pending-restore.js
npm run migration:run
npm run dashboard:setup
exec pm2-runtime ecosystem.config.js
