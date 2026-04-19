#!/bin/bash
set -e

BACKUP_DIR="./backups"

mapfile -t BACKUPS < <(ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null)

if [ ${#BACKUPS[@]} -eq 0 ]; then
  echo "No backups found in $BACKUP_DIR"
  exit 1
fi

parse_label() {
  local file="$1"
  local base; base=$(basename "$file" .sql.gz)
  # extract YYYYMMDD_HHMMSS from task-suggester_YYYYMMDD_HHMMSS
  if [[ "$base" =~ _([0-9]{8})_([0-9]{6})$ ]]; then
    local d="${BASH_REMATCH[1]}" t="${BASH_REMATCH[2]}"
    echo "${d:0:4}-${d:4:2}-${d:6:2} ${t:0:2}:${t:2:2}:${t:4:2}"
  else
    echo "$base"
  fi
}

LABELS=()
for f in "${BACKUPS[@]}"; do
  LABELS+=("$(parse_label "$f")  $(basename "$f")")
done

echo "Available backups:"
select LABEL in "${LABELS[@]}"; do
  [ -n "$LABEL" ] && BACKUP="${BACKUPS[$((REPLY-1))]}" && break
  echo "Invalid selection"
done

echo "Restoring $BACKUP ..."
read -r -p "Are you sure? This will overwrite the remote database. [y/N] " CONFIRM
[[ "$CONFIRM" =~ ^[yY]$ ]] || { echo "Aborted."; exit 1; }

gunzip -c "$BACKUP" | ssh flugfisch 'cd ~/docker/task-suggester && set -a && source .env && set +a && \
  docker compose exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"'

echo "Restore complete."
