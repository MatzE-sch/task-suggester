#!/bin/bash
set -e

docker compose -f compose.dev.yml build
docker compose -f compose.dev.yml up -d
echo "→ http://localhost:3000"
