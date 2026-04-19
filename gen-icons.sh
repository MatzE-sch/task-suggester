#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SVG="$SCRIPT_DIR/icon.svg"
OUT="$SCRIPT_DIR/frontend/static"

cp "$SVG" "$OUT/icon.svg"
rsvg-convert -w 192 -h 192 "$SVG" -o "$OUT/icon-192.png"
rsvg-convert -w 512 -h 512 "$SVG" -o "$OUT/icon-512.png"
magick "$OUT/icon-192.png" -resize 32x32 "$OUT/favicon.ico"

echo "Icons generiert."
