#!/usr/bin/env bash
set -e

if [ -z "$DOCKERHUB_USER" ]; then
  echo "Error: DOCKERHUB_USER is not set"
  echo "Usage: DOCKERHUB_USER=yourname ./scripts/push.sh"
  exit 1
fi

echo "Building and pushing as $DOCKERHUB_USER..."

docker build \
  --platform linux/amd64 \
  -f apps/api/Dockerfile \
  -t "$DOCKERHUB_USER/listenroom-api:latest" \
  .

docker build \
  --platform linux/amd64 \
  -f apps/web/Dockerfile \
  -t "$DOCKERHUB_USER/listenroom-web:latest" \
  .

docker push "$DOCKERHUB_USER/listenroom-api:latest"
docker push "$DOCKERHUB_USER/listenroom-web:latest"

echo ""
echo "Done. On EC2 run:"
echo "  DOCKERHUB_USER=$DOCKERHUB_USER docker compose -f docker-compose.prod.yml pull"
echo "  DOCKERHUB_USER=$DOCKERHUB_USER docker compose -f docker-compose.prod.yml up -d"
