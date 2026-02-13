const express = require("express");
const https = require("https");
const querystring = require("querystring");
const { db } = require("../db/db");
const bcrypt = require("bcryptjs");
const { requireAuth, requireOwner, optionalAuth } = require("../middleware/auth");
const { bookingLimiter } = require("../middleware/rateLimiter");
const { sanitizeBody, sanitizeString, isValidEmail } = require("../middleware/validate");

const router = express.Router();

// Sanitize all string fields
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

const sendOwnerBookingSms = ({ booking, customerName, customerEmail }) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.OWNER_PHONE_NUMBER;

  if (!sid || !token || !from || !to) {
    return Promise.resolve();
  }

  const bodyText = [
    "New d4gcutz booking",
    `Name: ${customerName}`,
    `Email: ${customerEmail}`,
    `Service: ${booking.service}`,
    `Date: ${booking.date}`,
    `Time (EST): ${formatTimeEST(booking.start_time)} - ${formatTimeEST(booking.end_time)}`,
  ].join("\n");

  const postData = querystring.stringify({
    To: to,
    From: from,
    Body: bodyText,
  });

  const options = {
    hostname: "api.twilio.com",
    path: `/2010-04-01/Accounts/${sid}/Messages.json`,
    method: "POST",
    auth: `${sid}:${token}`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Twilio SMS failed (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
};

router.get("/me", requireAuth, (req, res) => {
  db.all(
    `SELECT * FROM bookings WHERE user_id = ? ORDER BY date DESC, start_time DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Failed to fetch bookings" });
      }
      return res.json(rows);
    }
  );
});

router.get("/all", requireAuth, requireOwner, (req, res) => {
  db.all(
    `SELECT bookings.*, users.name AS user_name FROM bookings JOIN users ON bookings.user_id = users.id ORDER BY date DESC`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Failed to fetch bookings" });
      }
      return res.json(rows);
    }
  );
});

router.post("/", bookingLimiter, optionalAuth, (req, res) => {
  const { availability_id, service, customer_name, customer_email, address } = req.body;
  if (!availability_id || !service || !customer_name || !customer_email) {
    return res.status(400).json({ message: "Missing booking data." });
  }

  // Validate service name against whitelist
  if (!VALID_SERVICES.includes(service)) {
    return res.status(400).json({ message: "Invalid service selected." });
  }

  const email = String(customer_email).trim().toLowerCase();
  const name = sanitizeString(customer_name);
  const cleanAddress = address ? sanitizeString(address) : "";

  if (!name || name.length < 2 || name.length > 100) {
    return res.status(400).json({ message: "Name must be between 2 and 100 characters." });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email format." });
  }

  if (service === "Mobile" && !cleanAddress) {
    return res.status(400).json({ message: "Service address is required for mobile bookings." });
  }

  // Validate availability_id is a positive integer
  const slotId = Number(availability_id);
  if (!Number.isInteger(slotId) || slotId < 1) {
    return res.status(400).json({ message: "Invalid slot ID." });
  }

  const resolveUserId = (callback) => {
    if (req.user?.id) {
      return callback(null, req.user.id);
    }

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
      return res.status(400).json({ message: "Slot unavailable." });
    }

    resolveUserId((userErr, userId) => {
      if (userErr) {
        return res.status(500).json({ message: "Failed to resolve customer profile." });
      }

      const insert = `INSERT INTO bookings (user_id, service, date, start_time, end_time, status)
                      VALUES (?, ?, ?, ?, ?, 'BOOKED')`;
      db.run(insert, [userId, service, slot.date, slot.start_time, slot.end_time], function (insertErr) {
        if (insertErr) {
          return res.status(500).json({ message: "Failed to create booking." });
        }
        db.run(`UPDATE availability SET is_open = 0 WHERE id = ?`, [slotId]);

        const bookingPayload = {
          id: this.lastID,
          date: slot.date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          service,
          customer_name: name,
          customer_email: email,
        };

        sendOwnerBookingSms({
          booking: bookingPayload,
          customerName: name,
          customerEmail: email,
        }).catch((smsErr) => {
          console.error("Failed to send owner booking SMS:", smsErr.message);
        });

        return res.json(bookingPayload);
      });
    });
  });
});

module.exports = router;
