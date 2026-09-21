#!/usr/bin/env sh
set -e

cd "$(dirname "$0")"

VERSION="${PB_VERSION:-0.40.4}"

case "$(uname -s)/$(uname -m)" in
  Linux/x86_64) PLATFORM=linux_amd64 ;;
  Linux/aarch64) PLATFORM=linux_arm64 ;;
  Darwin/x86_64) PLATFORM=darwin_amd64 ;;
  Darwin/arm64) PLATFORM=darwin_arm64 ;;
  *)
    echo "Unsupported platform: $(uname -s)/$(uname -m)" >&2
    exit 1
    ;;
esac

if [ -x ./pocketbase ]; then
  echo "pocketbase already installed (run ./pocketbase update to upgrade)."
  exit 0
fi

URL="https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/pocketbase_${VERSION}_${PLATFORM}.zip"
echo "Downloading $URL"
curl -fsSL -o pocketbase.zip "$URL"
unzip -o pocketbase.zip
rm pocketbase.zip
chmod +x pocketbase
echo "Installed pocketbase v${VERSION}."