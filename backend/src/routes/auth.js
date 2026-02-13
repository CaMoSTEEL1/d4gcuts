const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("../db/db");
const { authLimiter } = require("../middleware/rateLimiter");
const { sanitizeBody } = require("../middleware/validate");
const { isValidEmail, isStrongPassword, sanitizeString } = require("../middleware/validate");
const { getSecret } = require("../middleware/auth");

const router = express.Router();

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
 * Accepts { username, password } — looks up by name where role = 'OWNER'.
 * Returns a JWT only if the account exists, password matches, and role is OWNER.
 */
router.post("/owner-login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required." });
  }

  const cleanUsername = sanitizeString(username);

  db.get(
    `SELECT * FROM users WHERE name = ? AND role = 'OWNER'`,
    [cleanUsername],
    (err, user) => {
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
        { expiresIn: "12h" } // shorter session for owner portal
      );
      return res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    }
  );
});

module.exports = router;
