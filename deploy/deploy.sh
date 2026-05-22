#!/usr/bin/env bash
# collaborate.so — deploy: SSH into the droplet, pull, rebuild, restart.
#
#   DEPLOY_HOST=root@203.0.113.10 ./deploy/deploy.sh
#
# Environment:
#   DEPLOY_HOST   user@host of the droplet            (required)
#   DEPLOY_DIR    repo path on the droplet            (default /opt/collaborate)
#   DEPLOY_BRANCH branch to deploy                    (default main)

set -euo pipefail

HOST="${DEPLOY_HOST:?set DEPLOY_HOST=user@host}"
DIR="${DEPLOY_DIR:-/opt/collaborate}"
BRANCH="${DEPLOY_BRANCH:-main}"

echo "→ deploying $BRANCH to $HOST:$DIR"

ssh "$HOST" bash -se <<EOF
  set -euo pipefail
  cd "$DIR"
  git fetch --quiet origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
  docker compose -f deploy/docker-compose.yml up -d --build
  docker image prune -f >/dev/null
  echo "→ waiting for health…"
  for i in \$(seq 1 20); do
    # Hit the real endpoint through Nginx+TLS (-k: the origin cert is for the
    # public hostname, not 127.0.0.1).
    if curl -fsSk https://127.0.0.1/healthz >/dev/null 2>&1; then
      echo "✓ healthy"; exit 0
    fi
    sleep 2
  done
  echo "✗ health check did not pass" >&2
  exit 1
EOF

echo "✓ deployed"
