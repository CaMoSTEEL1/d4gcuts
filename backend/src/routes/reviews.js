const express = require("express");
const { db } = require("../db/db");
const { requireAuth } = require("../middleware/auth");
const { reviewLimiter } = require("../middleware/rateLimiter");
const { sanitizeBody, sanitizeString } = require("../middleware/validate");

const router = express.Router();

router.use(sanitizeBody);

router.get("/", (req, res) => {
  db.all(
    `SELECT reviews.*, users.name FROM reviews JOIN users ON reviews.user_id = users.id ORDER BY reviews.created_at DESC`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Failed to fetch reviews" });
      }
      return res.json(rows);
    }
  );
});

router.post("/", reviewLimiter, requireAuth, (req, res) => {
  const { rating, comment } = req.body;

  // Validate rating is an integer between 1 and 5
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ message: "Rating must be an integer between 1 and 5." });
  }

  const cleanComment = sanitizeString(comment || "");
  if (cleanComment.length > 1000) {
    return res.status(400).json({ message: "Review comment must be under 1000 characters." });
  }

  // Prevent duplicate reviews: one review per user per 24h
  db.get(
    `SELECT id FROM reviews WHERE user_id = ? AND created_at > datetime('now', '-1 day')`,
    [req.user.id],
    (checkErr, existing) => {
      if (checkErr) {
        return res.status(500).json({ message: "Failed to check for existing reviews." });
      }
      if (existing) {
        return res.status(429).json({ message: "You can only submit one review per day." });
      }

      db.run(
        `INSERT INTO reviews (user_id, rating, comment) VALUES (?, ?, ?)`,
        [req.user.id, ratingNum, cleanComment],
        function (err) {
          if (err) {
            return res.status(500).json({ message: "Failed to save review." });
          }
          return res.json({ id: this.lastID, rating: ratingNum, comment: cleanComment });
        }
      );
    }
  );
});

module.exports = router;
