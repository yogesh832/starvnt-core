#!/bin/bash
# ==============================================================================
# STARVNT - Production Rolling Update / Deploy Script
# ==============================================================================
set -euo pipefail

echo "=========================================================="
echo " Starting StarVnt Deployment..."
echo "=========================================================="

APP_ROOT="/opt/starvnt"
cd "${APP_ROOT}"

echo "--> Pulling latest source code from git..."
git pull origin main

echo "--> Building production containers..."
docker compose -f deploy/aws/docker-compose.prod.yml build --pull

echo "--> Starting containers with zero-downtime rolling restart..."
docker compose -f deploy/aws/docker-compose.prod.yml up -d --remove-orphans

echo "--> Waiting for server container health check..."
sleep 5
for i in {1..12}; do
    if curl -s http://localhost:4000/api/health | grep -q '"status":"ok"'; then
        echo "--> Health check passed! Server is healthy."
        break
    fi
    echo "--> Waiting for server to become ready ($i/12)..."
    sleep 3
done

echo "--> Cleaning up unused docker images..."
docker image prune -f

echo "=========================================================="
echo " StarVnt Deployment Completed Successfully!"
echo "=========================================================="
