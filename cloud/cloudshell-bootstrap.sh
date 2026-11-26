#!/usr/bin/env bash
set -euo pipefail

echo "=== Diorama Stage Studio: Google Cloud Shell Bootstrap ==="
echo "Node.js : $(node -v 2>/dev/null || echo 'not found')"
echo "Git     : $(git --version 2>/dev/null || echo 'not found')"
echo "Disk    : $(df -h "$HOME" | tail -n 1)"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 20+ is required."
  exit 1
fi

echo ""
echo "[1/2] Checking JavaScript syntax..."
for f in $(find . -name '*.js' -o -name '*.mjs' | grep -v '/\.git/'); do
  node --check "$f"
done

echo "[2/2] Running automated test suite..."
npm test

echo ""
echo "Ready! Start live preview with:"
echo "  node cloud/dev-server.mjs"
echo "Then click Cloud Shell 'Web Preview' -> 'Preview on port 8080'."
