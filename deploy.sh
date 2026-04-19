#!/bin/bash
set -e

#git push origin master

rsync -av --delete \
  --exclude='node_modules' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.env' \
  . flugfisch:~/docker/task-suggester/

# Build images locally (uses warm local cache)
PUBLIC_API_URL=https://task-suggester.schu.gg/api docker compose -f compose.yml build

# Stream images to server via SSH pipe
docker save task-suggester-frontend task-suggester-backend \
  | gzip \
  | ssh flugfisch 'gunzip | docker load'

# Restart only changed containers (no --build, no down)
ssh flugfisch 'cd ~/docker/task-suggester && docker compose up -d'
