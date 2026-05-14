#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sudo cp "$SCRIPT_DIR/task-suggester-updater.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable task-suggester-updater
sudo systemctl restart task-suggester-updater
sudo systemctl status task-suggester-updater
