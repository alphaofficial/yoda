#!/bin/bash
set -euo pipefail

npm run migration:run
npm run dashboard:setup
exec pm2-runtime ecosystem.config.js
