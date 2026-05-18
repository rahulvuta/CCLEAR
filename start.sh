#!/usr/bin/env bash
# Fresh dev start: clear stale caches, install deps only when needed, launch Electron+Vite dev.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

SKIP_CACHE=0
REINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --no-clean) SKIP_CACHE=1 ;;
    --reinstall) REINSTALL=1 ;;
    -h|--help)
      echo "Usage: ./start.sh [--no-clean] [--reinstall]"
      echo "  --no-clean   Skip deleting local build/Vite caches"
      echo "  --reinstall  Remove node_modules and reinstall (slow)"
      exit 0
      ;;
  esac
done

if ! command -v npm >/dev/null 2>&1; then
  echo "start.sh: npm is not installed or not on PATH." >&2
  exit 1
fi

if [[ "$SKIP_CACHE" -eq 0 ]]; then
  echo "start.sh: clearing local dev/build caches..."
  rm -rf \
    out \
    .vite \
    node_modules/.vite \
    node_modules/.cache \
    2>/dev/null || true
fi

if [[ "$REINSTALL" -eq 1 ]]; then
  echo "start.sh: removing node_modules (reinstall)..."
  rm -rf node_modules
  rm -f .start-cache/deps.stamp
fi

mkdir -p .start-cache
hash_concat() {
  if command -v shasum >/dev/null 2>&1; then
    cat "$@" | shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    cat "$@" | sha256sum | awk '{print $1}'
  else
    cat "$@" | openssl dgst -sha256 | awk '{print $2}'
  fi
}
FILES=(package.json)
[[ -f package-lock.json ]] && FILES+=(package-lock.json)
DEPS_KEY="$(hash_concat "${FILES[@]}")"

if [[ ! -d node_modules ]] || [[ ! -f .start-cache/deps.stamp ]] || [[ "$(cat .start-cache/deps.stamp 2>/dev/null || true)" != "$DEPS_KEY" ]]; then
  echo "start.sh: installing dependencies..."
  npm install --no-audit --no-fund
  echo "$DEPS_KEY" > .start-cache/deps.stamp
else
  echo "start.sh: dependencies unchanged (skip install)."
fi

echo "start.sh: starting electron-vite dev..."
exec npm run dev
