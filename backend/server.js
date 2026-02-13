const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const { init, seedAdmin, seedWeekdayEveningAvailability } = require("./src/db/db");
const { globalLimiter } = require("./src/middleware/rateLimiter");
const errorHandler = require("./src/middleware/errorHandler");

const authRoutes = require("./src/routes/auth");
const availabilityRoutes = require("./src/routes/availability");
const bookingRoutes = require("./src/routes/bookings");
const paymentRoutes = require("./src/routes/payments");
const reviewRoutes = require("./src/routes/reviews");

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const RELEASE_ID = "2026-02-13-resilience-2";

/* ---------- Validate critical env vars ---------- */
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev_secret") {
  console.warn(
    "\x1b[33m%s\x1b[0m",
    "WARNING: JWT_SECRET is not set or is using the insecure default. Set a strong secret in .env for production!"
  );
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = require("crypto").randomBytes(64).toString("hex");
    if (IS_PRODUCTION) {
      console.error(
        "PRODUCTION WARNING: Auto-generated a temporary JWT_SECRET because none was provided. Sessions/tokens will be invalidated on restart. Set JWT_SECRET in backend/.env or hosting environment variables immediately."
      );
    } else {
      console.warn("Auto-generated a temporary JWT_SECRET for this session.");
    }
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

/* ---------- Security middleware ---------- */
app.use(
  helmet({
    contentSecurityPolicy: IS_PRODUCTION
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
  })
);

/* ---------- CORS ---------- */
if (IS_PRODUCTION) {
  // In production the frontend is served from the same origin — no CORS needed.
  // If you later add a separate frontend domain, configure ALLOWED_ORIGINS.
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (allowedOrigins.length > 0) {
    app.use(
      cors({
        origin: allowedOrigins,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    );
  }
} else {
  // Development — allow Vite dev server origins
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim());

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );
}

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Rate limiter
app.use(globalLimiter);

// Request logging
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

/* ---------- Database ---------- */
init();
seedAdmin();
seedWeekdayEveningAvailability();

/* ---------- API Routes ---------- */
app.use("/api/auth", authRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), release: RELEASE_ID });
});

/* ---------- Serve Frontend (production) ---------- */
const FRONTEND_DIST = path.join(__dirname, "..", "frontend", "dist");

if (IS_PRODUCTION) {
  // Serve static assets from the Vite build
  app.use(express.static(FRONTEND_DIST, { maxAge: "1y", immutable: true }));

  // SPA fallback: any non-API route serves index.html
  app.get("*", (req, res) => {
    if (req.originalUrl.startsWith("/api/")) {
      return res.status(404).json({ message: "API route not found" });
    }
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
} else {
  // Development root
  app.get("/", (_req, res) => {
    res.json({ status: "d4gcutz backend running (dev mode)" });
  });

  // 404 for unmatched routes in dev
  app.use((_req, res) => {
    res.status(404).json({ message: "Route not found" });
  });
}

/* ---------- Global error handler ---------- */
app.use(errorHandler);

/* ---------- Start server ---------- */
const server = app.listen(PORT, () => {
  console.log(
    `d4gcutz server listening on port ${PORT} [${IS_PRODUCTION ? "production" : "development"}]`
  );
  if (IS_PRODUCTION) {
    console.log(`Serving frontend from ${FRONTEND_DIST}`);
  }
});

/* ---------- Graceful shutdown ---------- */
const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Keep process alive long enough to inspect production errors instead of silent crash loops.
process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[Process] Uncaught exception:", error);
});
