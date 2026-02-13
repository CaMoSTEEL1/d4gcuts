const jwt = require("jsonwebtoken");

const crypto = require("crypto");

/**
 * Returns the JWT signing secret.
 * In production, JWT_SECRET MUST be set in .env.
 * In dev, a random ephemeral secret is generated per process start
 * (tokens won't survive restarts — that's fine for local dev).
 */
let _devSecret = null;
const getSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("FATAL: JWT_SECRET must be set in production .env");
  }
  if (!_devSecret) {
    _devSecret = crypto.randomBytes(48).toString("hex");
    console.warn("[Auth] No JWT_SECRET set — using ephemeral dev secret (tokens won't survive restart).");
  }
  return _devSecret;
};

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return res.status(401).json({ message: "Missing token" });
  }
  try {
    const payload = jwt.verify(token, getSecret());
    req.user = payload;
    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    return res.status(401).json({ message: "Invalid token" });
  }
};

/**
 * Optional auth: sets req.user if a valid token is present, but doesn't block.
 */
const optionalAuth = (req, _res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token) {
    try {
      req.user = jwt.verify(token, getSecret());
    } catch {
      // Invalid token — just continue without auth
    }
  }
  return next();
};

const requireOwner = (req, res, next) => {
  if (req.user?.role !== "OWNER") {
    return res.status(403).json({ message: "Owner access required" });
  }
  return next();
};

module.exports = { requireAuth, optionalAuth, requireOwner, getSecret };
