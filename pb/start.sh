#!/usr/bin/env sh
set -e

cd "$(dirname "$0")"

HTTP="${PB_HTTP:-127.0.0.1:8090}"

sh ./setup.sh
exec ./pocketbase serve --http "$HTTP"