#!/bin/sh
# Capture app screenshots with headless Chrome for the manual.
# Needs the API running:  .venv/bin/python -m attackpath.api.server
# Usage: sh scripts/screenshots.sh [out_dir]
set -eu
OUT="${1:-docs/img}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE="http://127.0.0.1:8000"
PROFILE="$(mktemp -d)"
mkdir -p "$OUT"

shot() {
  name="$1"; url="$2"; size="${3:-1440,900}"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --user-data-dir="$PROFILE" --window-size="$size" --virtual-time-budget=9000 \
    --screenshot="$OUT/$name.png" "$BASE/$url" >/dev/null 2>&1
  echo "$OUT/$name.png"
}

shot overview        "#/"
shot console-stage1  "#/console?net=62&stage=1"
shot console-stage2  "#/console?net=62&stage=2&reveal=1"
shot console-stage3  "#/console?net=62&stage=3"
shot results         "#/results"
shot method          "#/method"
shot event-log       "#/events"
shot reports         "#/reports"
