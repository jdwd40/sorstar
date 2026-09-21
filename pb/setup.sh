#!/usr/bin/env sh
set -e

cd "$(dirname "$0")"

EMAIL="${PB_SUPERUSER_EMAIL:-admin@sorstar.local}"
PASSWORD="${PB_SUPERUSER_PASSWORD:-sorstar-admin-dev}"

if [ ! -x ./pocketbase ]; then
  echo "PocketBase binary not found. Run: npm run pb:install" >&2
  exit 1
fi

./pocketbase superuser upsert "$EMAIL" "$PASSWORD"
./pocketbase migrate up
echo "PocketBase superuser and migrations are ready."