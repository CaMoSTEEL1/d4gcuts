const express = require("express");
const { db } = require("../db/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Service prices in cents (matches frontend display prices)
const SERVICE_PRICES = {
  "Full Cut": 3000,
  Lineup: 1500,
  Mobile: 5000,
};

// Lazy-init Square client — avoids startup crash if keys not set
let squareClient = null;
const getSquare = () => {
  if (!squareClient) {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) throw new Error("Square access token is not configured.");
    const { Client, Environment } = require("square");
    squareClient = new Client({
      accessToken: token,
      environment:
        process.env.SQUARE_ENVIRONMENT === "production"
          ? Environment.Production
          : Environment.Sandbox,
    });
  }
  return squareClient;
};

/**
 * POST /api/payments/checkout
 *
 * Creates a Square Payment Link for a confirmed booking.
 * No auth required — anyone with the booking_id can pay.
 * Returns { url } for the hosted Square payment page.
 */
router.post("/checkout", (req, res, next) => {
  const { booking_id } = req.body;

  if (!booking_id) {
    return res.status(400).json({ message: "booking_id is required." });
  }

  const id = Number(booking_id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: "Invalid booking ID." });
  }

  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) {
    return res
      .status(500)
      .json({ message: "Payment not configured. Please pay at your appointment." });
  }

  db.get(`SELECT * FROM bookings WHERE id = ?`, [id], async (err, booking) => {
    if (err) return next(err);
    if (!booking) return res.status(404).json({ message: "Booking not found." });

    try {
      const square = getSquare();
      const amountCents = SERVICE_PRICES[booking.service] || 3000;

      const origin =
        req.headers.origin || `${req.protocol}://${req.headers.host}`;

      const idempotencyKey = `booking-${id}-${Date.now()}`;

      const { result } = await square.checkoutApi.createPaymentLink({
        idempotencyKey,
        quickPay: {
          name: `d4gcutz — ${booking.service}`,
          priceMoney: {
            amount: BigInt(amountCents),
            currency: "USD",
          },
          locationId,
        },
        checkoutOptions: {
          redirectUrl: `${origin}/?payment=success&booking_id=${id}`,
        },
      });

      const paymentLink = result.paymentLink;

      // Record the pending payment
      db.run(
        `INSERT INTO payments (booking_id, amount, currency, status, stripe_payment_intent_id)
         VALUES (?, ?, ?, ?, ?)`,
        [id, amountCents, "usd", "pending", paymentLink.id]
      );

      return res.json({ url: paymentLink.url });
    } catch (squareErr) {
      console.error("[Square Checkout]", squareErr.message ?? squareErr);
      return res
        .status(500)
        .json({ message: "Payment setup failed. Please try again or pay at your appointment." });
    }
  });
});

/**
 * POST /api/payments/intent  (legacy — kept for compatibility)
 */
router.post("/intent", requireAuth, (req, res) => {
  return res.status(410).json({ message: "This endpoint is no longer available." });
});

module.exports = router;
