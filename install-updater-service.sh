#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cp "$SCRIPT_DIR/task-suggester-updater.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable task-suggester-updater
systemctl restart task-suggester-updater
systemctl status task-suggester-updater
