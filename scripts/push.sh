#!/usr/bin/env bash
set -e

if [ -z "$DOCKERHUB_USER" ]; then
  echo "Error: DOCKERHUB_USER is not set"
  echo "Usage: DOCKERHUB_USER=yourname ./scripts/push.sh"
  exit 1
fi

echo "Building and pushing as $DOCKERHUB_USER..."

# --cache-from pulls layer metadata from the last push so source-only rebuilds
# skip the pnpm install, apt-get, and pip steps entirely.
# --cache-to type=inline embeds cache metadata in the image for next time.
# --push combines build+push in one step (required for inline cache to work).

docker buildx build \
  --platform linux/amd64 \
  --cache-from "type=registry,ref=$DOCKERHUB_USER/listenroom-api:latest" \
  --cache-to "type=inline" \
  -t "$DOCKERHUB_USER/listenroom-api:latest" \
  -f apps/api/Dockerfile \
  --push \
  .

docker buildx build \
  --platform linux/amd64 \
  --cache-from "type=registry,ref=$DOCKERHUB_USER/listenroom-web:latest" \
  --cache-to "type=inline" \
  -t "$DOCKERHUB_USER/listenroom-web:latest" \
  -f apps/web/Dockerfile \
  --push \
  .

echo ""
echo "Done. On EC2 run:"
echo "  DOCKERHUB_USER=$DOCKERHUB_USER docker compose -f docker-compose.prod.yml pull"
echo "  DOCKERHUB_USER=$DOCKERHUB_USER docker compose -f docker-compose.prod.yml up -d"
