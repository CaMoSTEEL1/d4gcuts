const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

const dbPath = path.join(__dirname, "..", "..", "data.sqlite");
const db = new sqlite3.Database(dbPath);

const EVENING_SLOTS = [
  ["16:00", "17:00"],
  ["17:00", "18:00"],
  ["18:00", "19:00"],
  ["19:00", "20:00"],
  ["20:00", "21:00"],
  ["21:00", "22:00"],
];

const formatLocalDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const init = () => {
  // Enable WAL mode for better concurrent read performance
  db.run("PRAGMA journal_mode=WAL");
  // Enable foreign keys
  db.run("PRAGMA foreign_keys=ON");

  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS availability (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_open INTEGER NOT NULL DEFAULT 1
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        service TEXT NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'BOOKED',
        stripe_payment_intent_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        stripe_payment_intent_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`
    );

    /* ---------- Performance indexes ---------- */
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_availability_date ON availability(date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_availability_open ON availability(is_open, date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date, start_time, end_time)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at)`);
  });
};

/**
 * Seeds the admin/owner account on startup.
 * Credentials are read EXCLUSIVELY from env vars — never hardcoded.
 *   ADMIN_USERNAME  (required in .env)
 *   ADMIN_PASSWORD  (required in .env)
 *
 * If the account already exists, the password is updated to match the env var
 * so changes in .env are always reflected.
 */
const seedAdmin = () => {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.warn("[Seed] ADMIN_USERNAME and ADMIN_PASSWORD must be set in .env — skipping admin seed.");
    return;
  }

  const email = `${username}@d4gcutz.local`;

  const hash = bcrypt.hashSync(password, 12);

  db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, row) => {
    if (err) {
      console.error("[Seed] Failed to check for admin account:", err.message);
      return;
    }

    if (row) {
      // Update password + name in case env vars changed
      db.run(
        `UPDATE users SET name = ?, password_hash = ?, role = 'OWNER' WHERE id = ?`,
        [username, hash, row.id],
        (updateErr) => {
          if (updateErr) {
            console.error("[Seed] Failed to update admin account:", updateErr.message);
          } else {
            console.log(`[Seed] Admin account "${username}" synced.`);
          }
        }
      );
    } else {
      // Create the admin account
      db.run(
        `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'OWNER')`,
        [username, email, hash],
        (insertErr) => {
          if (insertErr) {
            console.error("[Seed] Failed to create admin account:", insertErr.message);
          } else {
            console.log(`[Seed] Admin account "${username}" created.`);
          }
        }
      );
    }
  });
};

/**
 * Seeds weekday (Mon-Fri) availability in 1-hour blocks from 4:00 PM to 10:00 PM.
 * Idempotent: only inserts slots that do not already exist.
 */
const seedWeekdayEveningAvailability = ({ daysAhead = 180 } = {}) => {
  const start = new Date();
  const end = new Date();
  end.setDate(start.getDate() + daysAhead);

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const stmt = db.prepare(
      `INSERT INTO availability (date, start_time, end_time, is_open)
       SELECT ?, ?, ?, 1
       WHERE NOT EXISTS (
         SELECT 1 FROM availability
         WHERE date = ? AND start_time = ? AND end_time = ?
       )`
    );

    let inserted = 0;

    for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
      const day = current.getDay();
      // Weekdays only: Monday (1) through Friday (5)
      if (day < 1 || day > 5) continue;

      // Use local calendar date (not UTC) so slots align with frontend date picker.
      const dateText = formatLocalDate(current);

      for (const [startTime, endTime] of EVENING_SLOTS) {
        stmt.run(
          [dateText, startTime, endTime, dateText, startTime, endTime],
          function () {
            inserted += this.changes;
          }
        );
      }
    }

    stmt.finalize((err) => {
      if (err) {
        db.run("ROLLBACK");
        console.error("[Seed] Failed to seed weekday evening availability:", err.message);
        return;
      }

      db.run("COMMIT", (commitErr) => {
        if (commitErr) {
          db.run("ROLLBACK");
          console.error("[Seed] Failed to commit weekday availability seed:", commitErr.message);
          return;
        }
        console.log(`[Seed] Weekday evening availability ensured. Inserted: ${inserted}`);
      });
    });
  });
};

module.exports = { db, init, seedAdmin, seedWeekdayEveningAvailability };
