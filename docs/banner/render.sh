#!/usr/bin/env bash
# Rebuild the README banner from the pipeline's series: python docs/banner/build.py && bash docs/banner/render.sh
cd "$(dirname "$0")"
U=$(mktemp -d)
google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --user-data-dir="$U" \
  --window-size=1600,440 --force-device-scale-factor=2 --virtual-time-budget=4000 \
  --screenshot="$PWD/banner.png" "file://$PWD/banner.html" 2>/dev/null
rm -rf "$U"
