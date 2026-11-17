#!/usr/bin/env bash
# Run once on the production instance after the customer Caddy route is live.
set -Eeuo pipefail
settings=/opt/starvnt/deploy-settings.json
base=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["compose"])' "$settings")
project=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["project"])' "$settings")
active=/opt/starvnt/deploy-state/active.yml
[[ -f "$base" && -f "$active" ]]
mkdir -p /opt/starvnt/customer/releases
backup="$base.before-customer.$(date +%s)"
cp -p "$base" "$backup"
if ! grep -qF './customer:/srv/customer:ro' "$base"; then
  python3 - "$base" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
content = path.read_text()
anchor = '      - ./Caddyfile:/etc/caddy/Caddyfile:ro\n'
if content.count(anchor) != 1:
    raise SystemExit('Expected one Caddyfile volume in the web service')
path.write_text(content.replace(anchor, anchor + '      - ./customer:/srv/customer:ro\n'))
PY
fi
if ! docker compose -p "$project" -f "$base" -f "$active" config --quiet; then
  cp -p "$backup" "$base"
  exit 1
fi
echo "Customer volume configured. Backup: $backup"
