#!/bin/sh
# Renders the app icons (red seal with a white 学) into app/icons/ using macOS Quick Look + sips.
# Usage: sh tools/make_icons.sh   (run from the project folder)
set -e
OUT="app/icons"; TMP="$(mktemp -d)"
mkdir -p "$OUT"
svg() { # $1 = file, $2 = frame inset, $3 = font size
cat > "$1" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dc4033"/><stop offset="1" stop-color="#b32121"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <rect x="$2" y="$2" width="$((512 - 2 * $2))" height="$((512 - 2 * $2))" rx="30" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="9"/>
  <text x="256" y="262" font-family="PingFang SC" font-weight="600" font-size="$3" fill="#fff" text-anchor="middle" dominant-baseline="central">学</text>
</svg>
SVG
}
svg "$TMP/icon.svg" 56 290
svg "$TMP/maskable.svg" 104 220
qlmanage -t -s 512 -o "$TMP" "$TMP/icon.svg" "$TMP/maskable.svg" >/dev/null 2>&1
cp "$TMP/icon.svg.png" "$OUT/icon-512.png"
cp "$TMP/maskable.svg.png" "$OUT/icon-maskable-512.png"
sips -z 192 192 "$TMP/icon.svg.png" --out "$OUT/icon-192.png" >/dev/null
sips -z 180 180 "$TMP/icon.svg.png" --out "$OUT/apple-touch-icon.png" >/dev/null
rm -rf "$TMP"
echo "icons written to $OUT"
