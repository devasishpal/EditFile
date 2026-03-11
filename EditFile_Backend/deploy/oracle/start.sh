#!/usr/bin/env bash
set -euo pipefail

pm2 start server.js --name editfile-backend
pm2 save
