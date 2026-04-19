#!/bin/bash
#############
#
# Run with ./backup.sh. To restore: gunzip -c backups/task-suggester_<timestamp>.sql.gz | ssh flugfisch 'cd
# ~/docker/task-suggester && set -a && source .env && set +a && docker compose exec -T db psql -U "$POSTGRES_USER"
# "$POSTGRES_DB"'
#
#############


set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
BACKUP_FILE="$BACKUP_DIR/task-suggester_$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Backing up database to $BACKUP_FILE..."

ssh flugfisch 'cd ~/docker/task-suggester && set -a && source .env && set +a && \
  docker compose exec -T db pg_dump --clean --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "$BACKUP_FILE"

echo "Done: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
