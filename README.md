# d4gcutz

Bold, immersive barbershop experience with booking, owner scheduling, auth, payments, and reviews.

## Getting Started

### Backend
```bash
cd backend
npm install
npm run dev
```

Create a `.env` in `backend` if you want to override defaults:
```
PORT=4000
JWT_SECRET=your_secret_here
STRIPE_SECRET=sk_test_...
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open the frontend URL shown in the terminal.

## Notes
- Register an **Owner** account from the UI to access the Owner Scheduling section.
- Stripe is wired for test mode via `STRIPE_SECRET`.
- Availability is stored in SQLite (`backend/data.sqlite`).