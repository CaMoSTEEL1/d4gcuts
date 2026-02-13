# d4gcutz — Hostinger Deployment Guide

## Architecture

In production, the app runs as a **single Node.js process**:
- Express serves the API at `/api/*`
- Express serves the built React frontend for all other routes
- No CORS needed — same origin
- SQLite database stored on disk

---

## Prerequisites

- Hostinger **VPS** or **Node.js hosting** plan
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
- Set the branch to `main`

### 3. Set the Node.js entry point

In Hostinger's Node.js settings:
- **Application root**: `/` (project root)
- **Application startup file**: `backend/server.js`
- **Node.js version**: 18+ (20 recommended)

### 4. Install dependencies and build

SSH into your server and run from the project root:

```bash
cd ~/public_html   # or wherever your app lives
npm install --production
cd frontend && npm install && npm run build && cd ..
cd backend && npm install --production && cd ..
```

Or if Hostinger supports custom build commands:
```bash
npm run postinstall
```

### 5. Configure environment variables

Copy the production template and fill in your values:

```bash
cp backend/.env.production backend/.env
nano backend/.env
```

**Required changes:**
- `JWT_SECRET` — Generate one: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- `ADMIN_PASSWORD` — Change from default
- `OWNER_REGISTRATION_SECRET` — Change from default
- Twilio credentials (if you want SMS notifications)
- Stripe secret (if you want payments)

### 6. Start the app

```bash
cd backend && NODE_ENV=production node server.js
```

Or configure Hostinger to run: `npm start` from the project root.

The server will start on the `PORT` specified in `.env` (default: 3000).

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
1. Pull the latest code
2. Rebuild the frontend: `cd frontend && npm run build`
3. Restart the Node.js app from the Hostinger panel

---

## File Structure (Production)

```
d4gcutz/
├── backend/
│   ├── server.js          ← Entry point
│   ├── .env               ← Your production env (never commit)
│   ├── data.sqlite        ← Database (auto-created)
│   ├── src/               ← API routes, middleware, DB
│   └── node_modules/
├── frontend/
│   ├── dist/              ← Built React app (served by Express)
│   └── node_modules/      ← Needed for build only
├── package.json           ← Root scripts
├── .gitignore
└── DEPLOY.md              ← This file
```

---

## Troubleshooting

**App won't start:**
- Check `JWT_SECRET` is set in `.env`
- Check `NODE_ENV=production` is set
- Check Node.js version: `node -v` (need 18+)

**Frontend shows blank page:**
- Make sure `frontend/dist/` exists: `ls frontend/dist/`
- If not, rebuild: `cd frontend && npm run build`

**API returns 404:**
- Make sure you're hitting `/api/...` routes
- Check the backend is running: `curl http://localhost:3000/api/health`

**Database issues:**
- The SQLite file is at `backend/data.sqlite`
- It's auto-created on first run
- Back it up regularly: `cp backend/data.sqlite backend/data.sqlite.backup`
