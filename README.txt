# Waslney — Hostinger Setup Guide

## The Problem
Your frontend loads at https://waslney.com but calls to /api/* return 404
because Node.js is not running or not configured on Hostinger.

---

## Fix — Step by Step

### Step 1: Upload your project files to Hostinger

Upload your ENTIRE project to:
  /home/u946447529/domains/waslney.com/public_html/

Your folder structure should look like:
  public_html/
    backend/
      server.js
      .env
      routes/
      socket/
      ...
    frontend/
      dist/       ← built React app (see Step 2)
      src/
      ...
    index.js
    package.json

---

### Step 2: Build the React frontend

On your LOCAL machine (or Hostinger terminal), run:
  cd frontend
  npm install
  npm run build

This creates frontend/dist/ — upload that dist/ folder to Hostinger too.

---

### Step 3: Enable Node.js on Hostinger

1. Log in to hPanel (panel.hostinger.com)
2. Go to: Websites → waslney.com → Node.js
3. Set:
   - Node.js version: 18 or 20
   - Application root: public_html
   - Application startup file: backend/server.js
   - Application mode: Production
4. Click SAVE / Enable
5. Click START APPLICATION

---

### Step 4: Install backend dependencies

In Hostinger Terminal (hPanel → Terminal) run:
  cd ~/domains/waslney.com/public_html/backend
  npm install

---

### Step 5: Verify it works

Open your browser and go to:
  https://waslney.com/api/health

You should see:
  {"status":"ok","time":"..."}

If you see that, everything is working!

---

### Step 6: If /api/health still 404s

Check if Hostinger's .htaccess is blocking the proxy.
Place the .htaccess file from this zip in:
  public_html/.htaccess

---

## Files in this zip

| File | Where to put it |
|------|----------------|
| backend/server.js | public_html/backend/server.js |
| backend/.env | public_html/backend/.env |
| .htaccess | public_html/.htaccess |
| ecosystem.config.json | public_html/ecosystem.config.json |

---

## Quick check commands (Hostinger Terminal)

# Check if Node is running
ps aux | grep node

# Start manually if needed
cd ~/domains/waslney.com/public_html
node backend/server.js

# Check logs
cat ~/.pm2/logs/waslney-error.log
