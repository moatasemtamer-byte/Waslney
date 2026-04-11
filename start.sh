#!/bin/bash
# ─────────────────────────────────────────────
#  Shuttle – build frontend & start everything
#  Usage: bash start.sh
# ─────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "🚐  Shuttle startup"
echo "────────────────────"

# 1. Install backend deps
echo "📦  Installing backend dependencies..."
cd "$ROOT/backend"
npm install --silent

# 2. Install frontend deps & build
echo "📦  Installing frontend dependencies..."
cd "$ROOT/frontend"
npm install --silent

echo "🔨  Building frontend..."
npm run build

# 3. Start backend (which now serves the built frontend)
echo ""
echo "✅  Build complete!"
echo "🚀  Starting server on http://localhost:3001"
echo "────────────────────"
echo ""
cd "$ROOT/backend"
node server.js
