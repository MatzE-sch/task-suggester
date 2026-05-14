#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/auto-update.log"
PUBLIC_API_URL="${PUBLIC_API_URL:-https://task-suggester.schu.gg/api}"
INTERVAL="${INTERVAL:-300}"  # seconds between checks, default 5 min
export GIT_SSH_COMMAND="ssh -i ~/.ssh/id_rsa_github_task_suggester_deploy -o IdentitiesOnly=yes"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

check_and_update() {
    cd "$SCRIPT_DIR"

    git fetch github deploy 2>>"$LOG_FILE"

    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse "github/deploy")

    if [ "$LOCAL" = "$REMOTE" ]; then
        log "Up to date ($LOCAL)."
        return
    fi

    log "New commits detected ($LOCAL -> $REMOTE), backing up database..."
    BACKUP_FILE="$SCRIPT_DIR/backups/task-suggester_$(date +%Y%m%d_%H%M%S).sql.gz"
    mkdir -p "$SCRIPT_DIR/backups"
    set -a && source .env && set +a
    docker compose -f compose.yml exec -T db pg_dump --clean --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" \
        | gzip > "$BACKUP_FILE" \
        && log "Backup saved: $BACKUP_FILE" \
        || { log "Backup FAILED, aborting update."; return 1; }

    log "Pulling and rebuilding..."
    git pull --ff-only github deploy

    PUBLIC_BUILD_TIME="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    PUBLIC_API_URL="$PUBLIC_API_URL" PUBLIC_BUILD_TIME="$PUBLIC_BUILD_TIME" docker compose -f compose.yml build
    docker compose -f compose.yml up -d

    log "Done. Running commit: $(git rev-parse HEAD)"
}

log "Auto-updater started (interval: ${INTERVAL}s)."

while true; do
    check_and_update || log "Update check failed (exit $?)."
    sleep "$INTERVAL"
done
