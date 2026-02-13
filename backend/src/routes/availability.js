const express = require("express");
const { db } = require("../db/db");
const { requireAuth, requireOwner } = require("../middleware/auth");

const router = express.Router();

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "");
const isValidTime = (value) => /^\d{2}:\d{2}$/.test(value || "");

const normalizeSlot = (slot = {}) => ({
  date: slot.date,
  start_time: slot.start_time,
  end_time: slot.end_time,
  is_open: slot.is_open ? 1 : 0,
});

const validateSlot = (slot) => {
  if (!isValidDate(slot.date)) return "Invalid date format (YYYY-MM-DD required).";
  if (!isValidTime(slot.start_time) || !isValidTime(slot.end_time)) {
    return "Invalid time format (HH:MM required).";
  }
  if (slot.start_time >= slot.end_time) {
    return "Start time must be before end time.";
  }
  return null;
};

const hasOverlap = ({ date, start_time, end_time, excludeId = null }) =>
  new Promise((resolve, reject) => {
    const params = [date, end_time, start_time];
    let query = `
      SELECT id FROM availability
      WHERE date = ?
        AND start_time < ?
        AND end_time > ?
    `;

    if (excludeId) {
      query += " AND id != ?";
      params.push(excludeId);
    }

    db.get(query, params, (err, row) => {
      if (err) return reject(err);
      return resolve(Boolean(row));
    });
  });

router.get("/open", (req, res) => {
  const { date } = req.query;
  const params = [];
  let query = `SELECT * FROM availability WHERE is_open = 1`;
  if (date) {
    query += " AND date = ?";
    params.push(date);
  }
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Failed to fetch availability" });
    }
    return res.json(rows);
  });
});

router.get("/all", requireAuth, requireOwner, (req, res) => {
  db.all(
    `SELECT a.*,
            EXISTS(
              SELECT 1
              FROM bookings b
              WHERE b.date = a.date
                AND b.start_time = a.start_time
                AND b.end_time = a.end_time
                AND b.status = 'BOOKED'
            ) AS is_booked
      FROM availability a
      ORDER BY a.date, a.start_time`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Failed to fetch availability" });
      }
      return res.json(rows);
    }
  );
});

router.get("/range", requireAuth, requireOwner, (req, res) => {
  const { from, to } = req.query;
  if (!isValidDate(from) || !isValidDate(to)) {
    return res.status(400).json({ message: "from and to are required in YYYY-MM-DD format" });
  }

  db.all(
    `SELECT a.*,
            EXISTS(
              SELECT 1
              FROM bookings b
              WHERE b.date = a.date
                AND b.start_time = a.start_time
                AND b.end_time = a.end_time
                AND b.status = 'BOOKED'
            ) AS is_booked
      FROM availability a
      WHERE a.date BETWEEN ? AND ?
      ORDER BY a.date, a.start_time`,
    [from, to],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Failed to fetch availability" });
      }
      return res.json(rows);
    }
  );
});

router.post("/", requireAuth, requireOwner, async (req, res) => {
  const slot = normalizeSlot(req.body);
  const validationError = validateSlot(slot);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  try {
    const overlap = await hasOverlap(slot);
    if (overlap) {
      return res.status(400).json({ message: "Slot overlaps an existing availability block." });
    }
  } catch (err) {
    return res.status(500).json({ message: "Failed to validate slot overlap" });
  }

  db.run(
    `INSERT INTO availability (date, start_time, end_time, is_open) VALUES (?, ?, ?, ?)`,
    [slot.date, slot.start_time, slot.end_time, slot.is_open],
    function (err) {
      if (err) {
        return res.status(500).json({ message: "Failed to create slot" });
      }
      return res.json({ id: this.lastID, ...slot });
    }
  );
});

router.put("/:id", requireAuth, requireOwner, async (req, res) => {
  const slot = normalizeSlot(req.body);
  const validationError = validateSlot(slot);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  try {
    const overlap = await hasOverlap({ ...slot, excludeId: req.params.id });
    if (overlap) {
      return res.status(400).json({ message: "Slot overlaps an existing availability block." });
    }
  } catch (err) {
    return res.status(500).json({ message: "Failed to validate slot overlap" });
  }

  db.run(
    `UPDATE availability
      SET date = ?, start_time = ?, end_time = ?, is_open = ?
      WHERE id = ?`,
    [slot.date, slot.start_time, slot.end_time, slot.is_open, req.params.id],
    function (err) {
      if (err) {
        return res.status(500).json({ message: "Failed to update slot" });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: "Slot not found" });
      }
      return res.json({ id: Number(req.params.id), ...slot });
    }
  );
});

router.delete("/:id", requireAuth, requireOwner, (req, res) => {
  db.get(
    `SELECT id
      FROM bookings
      WHERE date = (SELECT date FROM availability WHERE id = ?)
        AND start_time = (SELECT start_time FROM availability WHERE id = ?)
        AND end_time = (SELECT end_time FROM availability WHERE id = ?)
        AND status = 'BOOKED'`,
    [req.params.id, req.params.id, req.params.id],
    (bookingErr, booking) => {
      if (bookingErr) {
        return res.status(500).json({ message: "Failed to validate slot deletion" });
      }
      if (booking) {
        return res.status(400).json({ message: "Cannot delete a slot that is already booked." });
      }

      db.run(`DELETE FROM availability WHERE id = ?`, [req.params.id], function (err) {
        if (err) {
          return res.status(500).json({ message: "Failed to delete slot" });
        }
        if (this.changes === 0) {
          return res.status(404).json({ message: "Slot not found" });
        }
        return res.json({ deleted: this.changes });
      });
    }
  );
});

router.post("/generate", requireAuth, requireOwner, (req, res) => {
  const {
    from,
    to,
    weekdays,
    start_time,
    end_time,
    interval_minutes = 60,
    is_open = true,
  } = req.body;

  if (!isValidDate(from) || !isValidDate(to)) {
    return res.status(400).json({ message: "from and to are required in YYYY-MM-DD format" });
  }
  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    return res.status(400).json({ message: "weekdays array is required (0=Sun..6=Sat)" });
  }
  if (!isValidTime(start_time) || !isValidTime(end_time) || start_time >= end_time) {
    return res.status(400).json({ message: "Valid start_time/end_time required" });
  }
  if (!Number.isInteger(interval_minutes) || interval_minutes < 15) {
    return res.status(400).json({ message: "interval_minutes must be an integer >= 15" });
  }

  const weekdaySet = new Set(weekdays.map(Number));
  const generatedSlots = [];

  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);

  for (let current = new Date(fromDate); current <= toDate; current.setDate(current.getDate() + 1)) {
    if (!weekdaySet.has(current.getDay())) continue;

    const dateText = current.toISOString().slice(0, 10);

    const [startHour, startMinute] = start_time.split(":").map(Number);
    const [endHour, endMinute] = end_time.split(":").map(Number);
    let cursor = startHour * 60 + startMinute;
    const rangeEnd = endHour * 60 + endMinute;

    while (cursor + interval_minutes <= rangeEnd) {
      const slotStartH = String(Math.floor(cursor / 60)).padStart(2, "0");
      const slotStartM = String(cursor % 60).padStart(2, "0");
      const slotEndMinutes = cursor + interval_minutes;
      const slotEndH = String(Math.floor(slotEndMinutes / 60)).padStart(2, "0");
      const slotEndM = String(slotEndMinutes % 60).padStart(2, "0");

      generatedSlots.push({
        date: dateText,
        start_time: `${slotStartH}:${slotStartM}`,
        end_time: `${slotEndH}:${slotEndM}`,
        is_open: is_open ? 1 : 0,
      });

      cursor += interval_minutes;
    }
  }

  if (generatedSlots.length === 0) {
    return res.status(400).json({ message: "No slots generated for the given configuration." });
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const stmt = db.prepare(
      `INSERT INTO availability (date, start_time, end_time, is_open)
       SELECT ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM availability
         WHERE date = ? AND start_time = ? AND end_time = ?
       )`
    );

    let inserted = 0;
    generatedSlots.forEach((slot) => {
      stmt.run(
        [
          slot.date,
          slot.start_time,
          slot.end_time,
          slot.is_open,
          slot.date,
          slot.start_time,
          slot.end_time,
        ],
        function () {
          inserted += this.changes;
        }
      );
    });

    stmt.finalize((stmtErr) => {
      if (stmtErr) {
        db.run("ROLLBACK");
        return res.status(500).json({ message: "Failed to generate slots" });
      }
      db.run("COMMIT", (commitErr) => {
        if (commitErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ message: "Failed to commit generated slots" });
        }
        return res.json({ inserted, generated: generatedSlots.length });
      });
    });
  });
});

router.post("/bulk", requireAuth, requireOwner, (req, res) => {
  const { slots } = req.body;
  if (!Array.isArray(slots)) {
    return res.status(400).json({ message: "Slots array required" });
  }

  const normalized = slots.map(normalizeSlot);
  for (const slot of normalized) {
    const validationError = validateSlot(slot);
    if (validationError) {
      return res.status(400).json({ message: validationError, slot });
    }
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const stmt = db.prepare(
      `INSERT INTO availability (date, start_time, end_time, is_open)
       SELECT ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM availability
         WHERE date = ? AND start_time = ? AND end_time = ?
       )`
    );

    let inserted = 0;
    normalized.forEach((slot) => {
      stmt.run(
        [
          slot.date,
          slot.start_time,
          slot.end_time,
          slot.is_open,
          slot.date,
          slot.start_time,
          slot.end_time,
        ],
        function () {
          inserted += this.changes;
        }
      );
    });

    stmt.finalize((err) => {
      if (err) {
        db.run("ROLLBACK");
        return res.status(500).json({ message: "Failed to save availability" });
      }
      db.run("COMMIT", (commitErr) => {
        if (commitErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ message: "Failed to commit availability update" });
        }
        return res.json({ message: "Availability updated", inserted, requested: normalized.length });
      });
    });
  });
});

router.patch("/:id", requireAuth, requireOwner, (req, res) => {
  const { is_open } = req.body;
  db.run(
    `UPDATE availability SET is_open = ? WHERE id = ?`,
    [is_open ? 1 : 0, req.params.id],
    function (err) {
      if (err) {
        return res.status(500).json({ message: "Failed to update slot" });
      }
      return res.json({ updated: this.changes });
    }
  );
});

module.exports = router;
