#!/usr/bin/env bash
set -Eeuo pipefail
sha=${1:?commit required}
release=${2:?release directory required}
[[ "$sha" =~ ^[0-9a-f]{40}$ && "$release" == "/opt/starvnt/releases/$sha" ]]
settings=/opt/starvnt/deploy-settings.json
read_setting() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$settings" "$1"; }
base=$(read_setting compose)
project=$(read_setting project)
web_env=$(read_setting web_env)
caddy=$(read_setting caddy)
[[ -f "$base" && -f "$web_env" && -f "$caddy" ]]
state=/opt/starvnt/deploy-state
mkdir -p "$state"
active="$state/active.yml"
backup="$state/$sha-$(date +%s)"
mkdir -p "$backup"
cp "$caddy" "$backup/Caddyfile"
backend_id=$(docker inspect --format '{{.Image}}' "${project}-backend-1")
web_id=$(docker inspect --format '{{.Image}}' "${project}-web-1")
printf 'services:\n  backend:\n    image: %s\n  web:\n    image: %s\n' "$backend_id" "$web_id" > "$backup/previous.yml"
if [[ -f "$active" ]]; then cp "$active" "$backup/active.yml"; fi

# Build both images before changing any running service. No environment values
# are logged; only the existing frontend env file is passed as a BuildKit secret.
docker build --label "org.opencontainers.image.revision=$sha" \
  -t "starvnt-backend:$sha" -f "$release/deploy/aws/Dockerfile.backend" "$release"
docker build --label "org.opencontainers.image.revision=$sha" \
  --secret "id=web_env,src=$web_env" --build-arg "DEPLOY_SHA=$sha" \
  -t "starvnt-web:$sha" -f "$release/deploy/aws/Dockerfile.web" "$release"
docker run --rm --entrypoint caddy \
  -v "$release/deploy/aws/Caddyfile:/etc/caddy/Caddyfile:ro" \
  "starvnt-web:$sha" validate --config /etc/caddy/Caddyfile --adapter caddyfile

rollback() {
  result=$?
  trap - ERR
  echo 'Deployment failed; restoring previous images and routing.'
  cat "$backup/Caddyfile" > "$caddy"
  cp "$backup/previous.yml" "$active"
  docker compose -p "$project" -f "$base" -f "$active" up -d --no-build --pull never backend web || true
  # Keep the failed command's nonzero exit status visible in GitHub.
  exit "$result"
}
trap rollback ERR
printf 'services:\n  backend:\n    image: starvnt-backend:%s\n  web:\n    image: starvnt-web:%s\n' "$sha" "$sha" > "$active"
cat "$release/deploy/aws/Caddyfile" > "$caddy"
docker compose -p "$project" -f "$base" -f "$active" up -d --no-build --pull never backend web

healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 10 https://app.starvnt.com/api/health \
      | python3 -c 'import json,sys; assert json.load(sys.stdin).get("ok") is True' 2>/dev/null \
    && curl --fail --silent --max-time 10 https://vendor.starvnt.com/deployment.json \
      | python3 -c 'import json,sys; assert json.load(sys.stdin).get("commit")==sys.argv[1]' "$sha" 2>/dev/null; then
    healthy=true
    break
  fi
  sleep 3
done
[[ "$healthy" == true ]]
curl --fail --silent --max-time 15 https://app.starvnt.com/privacy-policy | grep -q '<div id="root">'
actual_backend=$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${project}-backend-1")
[[ "$actual_backend" == "$sha" ]]
trap - ERR
printf '%s\n' "$sha" > "$state/current-commit"
echo "Successfully deployed $sha; backend, frontend and privacy route verified."
