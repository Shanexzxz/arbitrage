#!/usr/bin/env bash
#
# Deploy the Arbitrage app to Cloudflare Pages.
#
# The app is a static frontend + a thin Node/Express backend (server/proxy.js)
# that provides two API routes. Cloudflare Pages only hosts static assets, so
# those routes are re-implemented as Pages Functions (see deploy/functions/):
#   /quote          -> functions/quote.js         (Yahoo Finance CORS proxy)
#   /api/changelog  -> functions/api/changelog.js  (build-time git log snapshot)
#
# Portable: no absolute paths, no dependency on any WorkBuddy binary. Resolves
# everything relative to the repo. Needs `node` and `wrangler` on PATH
# (or set WRANGLER=..., NODE=...). First run needs `wrangler login` once.
#
# Usage:
#   ./deploy/deploy.sh                       # public build (changelog stripped)
#   INCLUDE_CHANGELOG=1 ./deploy/deploy.sh   # internal build (changelog kept)
#   PROJECT=my-name ./deploy/deploy.sh       # override Pages project name
set -euo pipefail

# --- locate repo root (this script lives in <repo>/deploy) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST="$REPO/dist"

PROJECT="${PROJECT:-hynix-arbitrage}"
NODE="${NODE:-node}"
# Prefer an explicit $WRANGLER, else a global wrangler, else `npx wrangler`.
if [ -n "${WRANGLER:-}" ]; then :;
elif command -v wrangler >/dev/null 2>&1; then WRANGLER="wrangler";
else WRANGLER="npx --yes wrangler"; fi

echo "==> Repo:    $REPO"
echo "==> Project: $PROJECT"
echo "==> Wrangler: $WRANGLER"

# --- 1. assemble dist/ from the static frontend (exclude server-only stuff) ---
echo "==> Assembling dist/"
rm -rf "$DIST"
mkdir -p "$DIST"
rsync -a \
  --exclude='.git' --exclude='deploy' --exclude='dist' --exclude='server' \
  --exclude='tools' --exclude='tests' --exclude='docs' \
  --exclude='*.sh' --exclude='*.log' --exclude='.server.pid' \
  --exclude='node_modules' --exclude='.gitignore' --exclude='README.md' \
  "$REPO/" "$DIST/"

# --- 2. bring in the Pages Functions ---
echo "==> Adding Pages Functions"
mkdir -p "$DIST/functions"
cp "$SCRIPT_DIR/functions/quote.js" "$DIST/functions/quote.js"

# --- 3. changelog: keep (internal) or strip (public) ---
if [ "${INCLUDE_CHANGELOG:-0}" = "1" ]; then
  echo "==> Internal build: baking /api/changelog snapshot"
  "$NODE" "$SCRIPT_DIR/gen-changelog.cjs"
  mkdir -p "$DIST/functions/api"
  cp "$SCRIPT_DIR/functions/api/changelog.js" "$DIST/functions/api/changelog.js"
else
  echo "==> Public build: stripping changelog"
  "$NODE" "$SCRIPT_DIR/strip-changelog.cjs" "$DIST"
fi

# --- 4. deploy (MUST cd into dist — wrangler resolves functions/ from CWD) ---
echo "==> Deploying"
( cd "$DIST" && $WRANGLER pages deploy . --project-name="$PROJECT" --branch=main --commit-dirty=true )

# --- 5. verify from an outsider's perspective ---
BASE="https://${PROJECT}.pages.dev"
echo "==> Verifying $BASE"
curl -sL -o /dev/null -w "  index   %{http_code}\n" "$BASE/"
curl -sL -o /dev/null -w "  /quote  %{http_code}\n" "$BASE/quote?symbol=000660.KS&interval=5m&range=1d"
if [ "${INCLUDE_CHANGELOG:-0}" = "1" ]; then
  curl -sL -o /dev/null -w "  /api/changelog %{http_code} (expect 200)\n" "$BASE/api/changelog?limit=3"
else
  if curl -sL "$BASE/api/changelog?limit=3" | head -c 20 | grep -q '{'; then
    echo "  !! /api/changelog STILL SERVES JSON — changelog leaked"; exit 1
  fi
  echo "  /api/changelog  gone (SPA fallback, no JSON)"
fi
echo "Done: $BASE"
