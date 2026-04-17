#!/bin/bash
echo "=== Installing & building Waslney ==="

# Build frontend
echo "→ Installing frontend deps..."
cd frontend && npm install && npm run build && cd ..

# Install backend deps
echo "→ Installing backend deps..."
cd backend && npm install && cd ..

echo "=== Done! Starting server... ==="
cd backend && node server.js
