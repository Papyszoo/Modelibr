#!/usr/bin/env bash
set -euo pipefail

# Build the Docusaurus site + Vite demo app and combine them.
# The result is in docs/build/ with the demo app at docs/build/demo/.
#
# Usage: ./scripts/build-with-demo.sh

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Building Docusaurus site ==="
cd "$REPO_ROOT/docs"
npm ci
npm run build

echo ""
echo "=== Building demo app ==="
cd "$REPO_ROOT/src/frontend"
npm ci
npm run build:demo

echo ""
echo "=== Combining outputs ==="
mkdir -p "$REPO_ROOT/docs/build/demo"
cp -r "$REPO_ROOT/src/frontend/dist/"* "$REPO_ROOT/docs/build/demo/"

echo ""
echo "Done! Combined site is at: docs/build/"
echo "  Docusaurus: docs/build/index.html"
echo "  Demo app:   docs/build/demo/index.html"
echo ""
echo "To preview locally:"
echo "  cd docs/build && npx serve -l 3000"
