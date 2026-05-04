#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/auto-update.log"
PUBLIC_API_URL="${PUBLIC_API_URL:-https://task-suggester.schu.gg/api}"
INTERVAL="${INTERVAL:-300}"  # seconds between checks, default 5 min

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

check_and_update() {
    cd "$SCRIPT_DIR"

    git fetch origin 2>>"$LOG_FILE"

    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse "@{u}")

    if [ "$LOCAL" = "$REMOTE" ]; then
        log "Up to date ($LOCAL)."
        return
    fi

    log "New commits detected ($LOCAL -> $REMOTE), pulling and rebuilding..."
    git pull --ff-only

    PUBLIC_API_URL="$PUBLIC_API_URL" docker compose -f compose.yml build
    docker compose -f compose.yml up -d

    log "Done. Running commit: $(git rev-parse HEAD)"
}

log "Auto-updater started (interval: ${INTERVAL}s)."

while true; do
    check_and_update || log "Update check failed (exit $?)."
    sleep "$INTERVAL"
done
