const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

const dbPath = path.join(__dirname, "..", "..", "data.sqlite");
const db = new sqlite3.Database(dbPath);

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

module.exports = { db, init, seedAdmin };
