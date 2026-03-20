const express = require("express");
const https = require("https");
const { db } = require("../db/db");
const bcrypt = require("bcryptjs");
const { requireAuth, requireOwner, optionalAuth } = require("../middleware/auth");
const { bookingLimiter } = require("../middleware/rateLimiter");
const { sanitizeBody, sanitizeString, isValidEmail } = require("../middleware/validate");

const router = express.Router();

router.use(sanitizeBody);

const VALID_SERVICES = ["Full Cut", "Lineup", "Mobile"];

const formatTimeEST = (time24) => {
  const [hStr = "0", mStr = "0"] = String(time24 || "00:00").split(":");
  const hour = Number(hStr);
  const minute = Number(mStr);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
};

/**
 * Notify the owner via ntfy.sh push notification.
 * Owner installs the ntfy app (iOS/Android), subscribes to the topic set in NTFY_TOPIC.
 * https://ntfy.sh — completely free, no account required.
 */
const notifyOwner = ({ booking, customerName, customerEmail, customerPhone }) => {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return Promise.resolve(); // silently skip if not configured

  const lines = [
    `✂️  ${booking.service}`,
    `📅  ${booking.date}  •  ${formatTimeEST(booking.start_time)}–${formatTimeEST(booking.end_time)} EST`,
    `👤  ${customerName}`,
    `📧  ${customerEmail}`,
    customerPhone ? `📱  ${customerPhone}` : null,
    booking.address ? `📍  ${booking.address}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const postData = lines;
  const options = {
    hostname: "ntfy.sh",
    path: `/${encodeURIComponent(topic)}`,
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "Title": "New d4gcutz Booking",
      "Priority": "high",
      "Tags": "scissors,calendar",
      "Content-Length": Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      res.resume();
      resolve();
    });
    req.on("error", (err) => {
      console.error("[ntfy] Notification failed:", err.message);
      resolve(); // never block booking on notification failure
    });
    req.write(postData);
    req.end();
  });
};

router.get("/me", requireAuth, (req, res) => {
  db.all(
    `SELECT * FROM bookings WHERE user_id = ? ORDER BY date DESC, start_time DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "Failed to fetch bookings" });
      return res.json(rows);
    }
  );
});

router.get("/all", requireAuth, requireOwner, (req, res) => {
  db.all(
    `SELECT bookings.*, users.name AS user_name
     FROM bookings
     JOIN users ON bookings.user_id = users.id
     ORDER BY date DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "Failed to fetch bookings" });
      return res.json(rows);
    }
  );
});

router.post("/", bookingLimiter, optionalAuth, (req, res) => {
  const {
    availability_id,
    service,
    customer_name,
    customer_email,
    customer_phone,
    address,
  } = req.body;

  if (!availability_id || !service || !customer_name || !customer_email) {
    return res.status(400).json({ message: "Missing required booking fields." });
  }

  if (!VALID_SERVICES.includes(service)) {
    return res.status(400).json({ message: "Invalid service selected." });
  }

  const email = String(customer_email).trim().toLowerCase();
  const name = sanitizeString(customer_name);
  const phone = customer_phone ? sanitizeString(String(customer_phone)) : "";
  const cleanAddress = address ? sanitizeString(address) : "";

  if (!name || name.length < 2 || name.length > 100) {
    return res.status(400).json({ message: "Name must be 2–100 characters." });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email address." });
  }

  if (service === "Mobile" && !cleanAddress) {
    return res.status(400).json({ message: "A service address is required for mobile bookings." });
  }

  const slotId = Number(availability_id);
  if (!Number.isInteger(slotId) || slotId < 1) {
    return res.status(400).json({ message: "Invalid slot ID." });
  }

  const resolveUserId = (callback) => {
    if (req.user?.id) return callback(null, req.user.id);

    db.get(`SELECT id FROM users WHERE email = ?`, [email], (findErr, userRow) => {
      if (findErr) return callback(findErr);
      if (userRow?.id) return callback(null, userRow.id);

      const generatedPassword = `guest-${Date.now()}-${require("crypto").randomBytes(16).toString("hex")}`;
      const password_hash = bcrypt.hashSync(generatedPassword, 12);

      db.run(
        `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'USER')`,
        [name, email, password_hash],
        function (createErr) {
          if (createErr) return callback(createErr);
          return callback(null, this.lastID);
        }
      );
    });
  };

  db.get(`SELECT * FROM availability WHERE id = ? AND is_open = 1`, [slotId], (err, slot) => {
    if (err || !slot) {
      return res.status(400).json({ message: "That slot is no longer available." });
    }

    resolveUserId((userErr, userId) => {
      if (userErr) {
        return res.status(500).json({ message: "Failed to resolve customer profile." });
      }

      db.run(
        `INSERT INTO bookings
           (user_id, service, date, start_time, end_time, status, address, customer_phone)
         VALUES (?, ?, ?, ?, ?, 'BOOKED', ?, ?)`,
        [userId, service, slot.date, slot.start_time, slot.end_time, cleanAddress, phone],
        function (insertErr) {
          if (insertErr) {
            return res.status(500).json({ message: "Failed to create booking." });
          }

          // Immediately close the slot so no double-bookings
          db.run(`UPDATE availability SET is_open = 0 WHERE id = ?`, [slotId]);

          const bookingPayload = {
            id: this.lastID,
            date: slot.date,
            start_time: slot.start_time,
            end_time: slot.end_time,
            service,
            customer_name: name,
            customer_email: email,
            customer_phone: phone,
            address: cleanAddress,
          };

          // Notify owner (fire-and-forget — never blocks the response)
          notifyOwner({
            booking: bookingPayload,
            customerName: name,
            customerEmail: email,
            customerPhone: phone,
          }).catch((notifyErr) => {
            console.error("[ntfy] Unexpected error:", notifyErr.message);
          });

          return res.json(bookingPayload);
        }
      );
    });
  });
});

module.exports = router;
