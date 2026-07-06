#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SVG="$SCRIPT_DIR/icon.svg"
OUT="$SCRIPT_DIR/frontend/static"

cp "$SVG" "$OUT/icon.svg"
rsvg-convert -w 192 -h 192 "$SVG" -o "$OUT/icon-192.png"
rsvg-convert -w 512 -h 512 "$SVG" -o "$OUT/icon-512.png"
magick "$OUT/icon-192.png" -resize 32x32 "$OUT/favicon.ico"

# --- Android-Launcher-Icons (Capacitor-App) ---
RES="$SCRIPT_DIR/frontend/android/app/src/main/res"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Glyph-only-SVG für das Adaptive-Icon-Foreground: Hintergrund-Pfad entfernen
# (der Hintergrund kommt aus values/ic_launcher_background.xml)
python3 - "$SVG" "$TMP/glyph.svg" <<'EOF'
import re, sys
text = open(sys.argv[1]).read()
new, n = re.compile(r'<path\b[^>]*fill:#6265f0[^>]*/>', re.S).subn('', text, count=1)
assert n == 1, 'Hintergrund-Pfad (fill:#6265f0) nicht gefunden'
open(sys.argv[2], 'w').write(new)
EOF

declare -A LEGACY=( [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192 )
declare -A ADAPTIVE=( [mdpi]=108 [hdpi]=162 [xhdpi]=216 [xxhdpi]=324 [xxxhdpi]=432 )
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  s=${LEGACY[$d]}; a=${ADAPTIVE[$d]}; dir="$RES/mipmap-$d"
  # Legacy-Icon: volles Icon (Squircle + Glyphe)
  rsvg-convert -w "$s" -h "$s" "$SVG" -o "$dir/ic_launcher.png"
  # Runde Variante: Kreismaske
  magick "$dir/ic_launcher.png" \
    \( -size "${s}x${s}" xc:none -fill white -draw "circle $((s/2)),$((s/2)) $((s/2)),0" \) \
    -alpha off -compose CopyOpacity -composite "$dir/ic_launcher_round.png"
  # Adaptive-Foreground: Glyphe bei 2/3 der Canvas zentriert (Safe-Zone 66/108)
  g=$(( a * 2 / 3 ))
  rsvg-convert -w "$g" -h "$g" "$TMP/glyph.svg" -o "$TMP/glyph-$d.png"
  magick -size "${a}x${a}" xc:none "$TMP/glyph-$d.png" -gravity center -composite \
    "$dir/ic_launcher_foreground.png"
done

echo "Icons generiert (PWA + Android)."
