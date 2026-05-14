#!/bin/bash
set -euo pipefail

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Merge current branch into deploy and push to GitHub
echo "Merging $ORIGINAL_BRANCH into deploy and pushing..."
git checkout deploy
git merge "$ORIGINAL_BRANCH"
git push github deploy
git checkout "$ORIGINAL_BRANCH"

# Backup on the server
echo "Backing up database on server..."
ssh flugfisch 'cd ~/docker/task-suggester && \
  set -a && source .env && set +a && \
  BACKUP_FILE="backups/task-suggester_$(date +%Y%m%d_%H%M%S).sql.gz" && \
  mkdir -p backups && \
  docker compose exec -T db pg_dump --clean --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_FILE" && \
  echo "Backup saved: $BACKUP_FILE"'

# Pull and rebuild on the server
echo "Pulling and rebuilding on server..."
ssh flugfisch 'cd ~/docker/task-suggester && \
  export GIT_SSH_COMMAND="ssh -i ~/.ssh/id_rsa_github_task_suggester_deploy -o IdentitiesOnly=yes" && \
  git fetch github deploy && \
  git pull --ff-only github deploy && \
  PUBLIC_BUILD_TIME="$(date -u "+%Y-%m-%dT%H:%M:%SZ")" \
  PUBLIC_API_URL="https://task-suggester.schu.gg/api" \
  docker compose -f compose.yml build && \
  docker compose -f compose.yml up -d'

echo "Done. Auto-updater will see no diff and skip its next check."
