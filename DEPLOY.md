# d4gcutz — Hostinger Deployment Guide

## Architecture

In production, the app runs as a **single Node.js process**:
- Express serves the API at `/api/*`
- Express serves the built React frontend for all other routes
- No CORS needed — same origin
- SQLite database stored on disk

---

## Prerequisites

- Hostinger **Node.js hosting** plan (Business or higher)
- Node.js 18+ on the server
- Git access to push your repo

---

## Step-by-step Deployment

### 1. Push to GitHub (or your Git host)

```bash
git add .
git commit -m "Initial deployment"
git remote add origin https://github.com/YOUR_USER/d4gcutz.git
git push -u origin main
```

### 2. Connect Hostinger to your repo

- In Hostinger panel, go to **Websites > Manage > Git**
- Connect your GitHub repo
- Set the branch to `main` (or `master`)

### 3. Configure Build Settings

When Hostinger asks you to configure build settings (Step 6 in their flow), use:

| Setting | Value |
|---------|-------|
| **Framework** | Express.js (auto-detected) |
| **Node.js version** | 20.x (recommended) |
| **Build command** | `npm run build` |
| **Start command** | `npm start` |

> Hostinger auto-detects Express.js from the root `package.json` dependencies.  
> The build command installs frontend deps and builds the React app.  
> The start command runs `node app.js` which bootstraps the Express server.

### 4. Configure environment variables

Set these in the Hostinger panel (during deployment or after, under environment variables):

- `NODE_ENV` = `production`
- `JWT_SECRET` — Generate one: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- `ADMIN_USERNAME` — Your admin username
- `ADMIN_PASSWORD` — A strong password
- `OWNER_REGISTRATION_SECRET` — A secret string for owner registration
- `STRIPE_SECRET` — (optional, for payments)
- Twilio credentials — (optional, for SMS notifications)

Alternatively, create a `backend/.env` file on the server:

```bash
cp backend/.env.production backend/.env
nano backend/.env
```

### 5. Deploy

Click **Deploy** in the Hostinger panel. Hostinger will:
1. Run `npm install` (installs backend/Express dependencies from root package.json)
2. Run the build command (installs frontend deps + builds React into `frontend/dist/`)
3. Start the app with `node app.js`

The server will start on the `PORT` provided by Hostinger.

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | No | Server port (default: 3000) |
| `JWT_SECRET` | **Yes** | Random secret for JWT signing. App exits if missing in production |
| `ADMIN_USERNAME` | No | Owner portal username (default: `admin`) |
| `ADMIN_PASSWORD` | No | Owner portal password (default: `d4gcutz`) |
| `OWNER_REGISTRATION_SECRET` | No | Secret to register new OWNER accounts |
| `STRIPE_SECRET` | No | Stripe secret key for payments |
| `TWILIO_ACCOUNT_SID` | No | Twilio SID for SMS |
| `TWILIO_AUTH_TOKEN` | No | Twilio auth token |
| `TWILIO_FROM_NUMBER` | No | Twilio sender number |
| `OWNER_PHONE_NUMBER` | No | Phone number to receive booking SMS |
| `ALLOWED_ORIGINS` | No | Comma-separated origins for CORS (leave empty for same-origin) |

---

## Custom Domain Setup

1. In Hostinger panel, point your domain to the server
2. Hostinger handles SSL automatically
3. No additional app config needed — the app serves everything from one port

---

## Updating the Site

```bash
git add .
git commit -m "Update description"
git push
```

Then on Hostinger:
1. Pull the latest code (or use auto-deploy if configured)
2. Rebuild the frontend: `npm run build`
3. Restart the Node.js app from the Hostinger panel

---

## File Structure (Production)

```
d4gcutz/
├── app.js                 ← Hostinger startup file (entry point)
├── package.json           ← Express deps + build/start scripts
├── node_modules/          ← Backend deps (installed by Hostinger)
├── backend/
│   ├── server.js          ← Express server (loaded by app.js)
│   ├── .env               ← Your production env (never commit)
│   ├── data.sqlite        ← Database (auto-created)
│   └── src/               ← API routes, middleware, DB
├── frontend/
│   ├── dist/              ← Built React app (served by Express)
│   └── node_modules/      ← Frontend deps (installed during build)
├── .gitignore
└── DEPLOY.md              ← This file
```

---

## Troubleshooting

**Hostinger says "framework not supported" or "incorrect structure":**
- Make sure `express` is listed in the root `package.json` dependencies (NOT in backend/package.json only)
- Make sure `app.js` exists in the project root
- Make sure `package.json` has `"main": "app.js"` and a `"start"` script
- Do NOT have a `postinstall` script — it interferes with Hostinger's build pipeline

**App won't start:**
- Check `JWT_SECRET` is set in `backend/.env`
- Check `NODE_ENV=production` is set
- Check Node.js version: `node -v` (need 18+)

**Frontend shows blank page:**
- Make sure `frontend/dist/` exists: `ls frontend/dist/`
- If not, rebuild: `npm run build`

**API returns 404:**
- Make sure you're hitting `/api/...` routes
- Check the backend is running: `curl http://localhost:3000/api/health`

**Environment variables not loading:**
- The `.env` file must be at `backend/.env` (not the project root)
- Or set them via the Hostinger panel

**Database issues:**
- The SQLite file is at `backend/data.sqlite`
- It's auto-created on first run
- Back it up regularly: `cp backend/data.sqlite backend/data.sqlite.backup`
