const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("../db/db");
const { authLimiter } = require("../middleware/rateLimiter");
const { sanitizeBody } = require("../middleware/validate");
const { isValidEmail, isStrongPassword, sanitizeString } = require("../middleware/validate");
const { getSecret } = require("../middleware/auth");

const router = express.Router();

const issueOwnerFallbackToken = ({ normalizedIdentifier, inputPassword, configuredUsername, configuredPassword, configuredEmail, res }) => {
  const usernameMatches = normalizedIdentifier === configuredUsername.toLowerCase();
  const emailMatches = normalizedIdentifier === configuredEmail.toLowerCase();
  const passwordMatches = inputPassword.trim() === configuredPassword;

  if (!(passwordMatches && (usernameMatches || emailMatches))) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const payload = { id: 0, email: configuredEmail, role: "OWNER", name: configuredUsername };

  const token = jwt.sign(
    { id: payload.id, email: payload.email, role: payload.role, name: payload.name },
    getSecret(),
    { expiresIn: "12h" }
  );
  return res.json({
    token,
    user: { id: payload.id, name: payload.name, email: payload.email, role: payload.role },
  });
};

// Apply rate limiter to all auth routes
router.use(authLimiter);

// Apply body sanitization
router.use(sanitizeBody);

router.post("/register", (req, res) => {
  const { name, email, password, role, owner_secret } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email, and password are required." });
  }

  const cleanName = sanitizeString(name);
  const cleanEmail = String(email).trim().toLowerCase();

  if (!cleanName || cleanName.length < 2 || cleanName.length > 100) {
    return res.status(400).json({ message: "Name must be between 2 and 100 characters." });
  }

  if (!isValidEmail(cleanEmail)) {
    return res.status(400).json({ message: "Invalid email format." });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      message: "Password must be at least 8 characters with at least 1 letter and 1 number.",
    });
  }

  // Owner registration requires a secret
  let userRole = "USER";
  if (role === "OWNER") {
    const requiredSecret = process.env.OWNER_REGISTRATION_SECRET;
    if (!requiredSecret || owner_secret !== requiredSecret) {
      return res.status(403).json({ message: "Invalid owner registration credentials." });
    }
    userRole = "OWNER";
  }

  const hashed = bcrypt.hashSync(password, 12);
  const stmt = `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`;
  db.run(stmt, [cleanName, cleanEmail, hashed, userRole], function (err) {
    if (err) {
      return res.status(400).json({ message: "Email already in use." });
    }
    return res.json({ id: this.lastID, name: cleanName, email: cleanEmail, role: userRole });
  });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const cleanEmail = String(email).trim().toLowerCase();

  db.get(`SELECT * FROM users WHERE email = ?`, [cleanEmail], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }
    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials." });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      getSecret(),
      { expiresIn: "7d" }
    );
    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  });
});

/**
 * Owner-only login endpoint.
 * Accepts { username, password } where username can be OWNER name or OWNER email.
 * Primary auth path: OWNER account from DB (bcrypt hash compare).
 * Fallback auth path: configured admin env credentials (or default fallback)
 * to avoid lockouts while seed/admin sync catches up.
 */
router.post("/owner-login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required." });
  }

  const cleanUsername = sanitizeString(username);
  const normalizedIdentifier = String(cleanUsername || "").trim().toLowerCase();
  const inputPassword = String(password);

  // Keep this in sync with DB seed fallback so owner login remains functional.
  const configuredUsername = String(process.env.ADMIN_USERNAME || "admin").trim();
  const configuredPassword = String(process.env.ADMIN_PASSWORD || "d4gcutz").trim();
  const configuredEmail = `${configuredUsername}@d4gcutz.local`;

  db.get(
    `SELECT *
      FROM users
      WHERE role = 'OWNER'
        AND (LOWER(name) = LOWER(?) OR LOWER(email) = LOWER(?))
      LIMIT 1`,
    [normalizedIdentifier, normalizedIdentifier],
    (err, user) => {
      if (err) {
        console.error("[Owner Login] DB error, attempting fallback auth:", err.message);
        return issueOwnerFallbackToken({
          normalizedIdentifier,
          inputPassword,
          configuredUsername,
          configuredPassword,
          configuredEmail,
          res,
        });
      }

      // Primary path: DB OWNER account
      if (user) {
        const valid = bcrypt.compareSync(inputPassword, user.password_hash);
        if (!valid) {
          return res.status(401).json({ message: "Invalid credentials." });
        }

        const token = jwt.sign(
          { id: user.id, email: user.email, role: user.role, name: user.name },
          getSecret(),
          { expiresIn: "12h" }
        );
        return res.json({
          token,
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
      }

      // Fallback path: env/default admin credentials
      return issueOwnerFallbackToken({
        normalizedIdentifier,
        inputPassword,
        configuredUsername,
        configuredPassword,
        configuredEmail,
        res,
      });
    }
  );
});

module.exports = router;
