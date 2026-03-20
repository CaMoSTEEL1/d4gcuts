const express = require("express");
const { db } = require("../db/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Lazy-init Stripe — avoids startup crash if key not set
let stripeInstance = null;
const getStripe = () => {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET;
    if (!key) throw new Error("Stripe secret key is not configured.");
    stripeInstance = require("stripe")(key);
  }
  return stripeInstance;
};

// Service prices in cents (matches frontend display prices)
const SERVICE_PRICES = {
  "Full Cut": 3000,
  Lineup: 1500,
  Mobile: 5000,
};

/**
 * POST /api/payments/checkout
 *
 * Creates a Stripe-hosted Checkout Session for a confirmed booking.
 * No auth required — anyone with the booking_id can pay.
 * Redirects customer to Stripe's hosted payment page.
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

  db.get(`SELECT * FROM bookings WHERE id = ?`, [id], async (err, booking) => {
    if (err) return next(err);
    if (!booking) return res.status(404).json({ message: "Booking not found." });

    try {
      const stripe = getStripe();
      const amount = SERVICE_PRICES[booking.service] || 3000;

      // Build origin from the request so it works on any domain
      const origin =
        req.headers.origin ||
        `${req.protocol}://${req.headers.host}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `d4gcutz — ${booking.service}`,
                description: `${booking.date} · ${booking.start_time}–${booking.end_time} EST`,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${origin}/?payment=success&booking_id=${id}`,
        cancel_url: `${origin}/?payment=cancelled&booking_id=${id}`,
        metadata: { booking_id: String(id) },
      });

      // Record the pending payment
      db.run(
        `INSERT INTO payments (booking_id, amount, currency, status, stripe_payment_intent_id)
         VALUES (?, ?, ?, ?, ?)`,
        [id, amount, "usd", "pending", session.payment_intent || session.id]
      );

      return res.json({ url: session.url });
    } catch (stripeErr) {
      console.error("[Stripe Checkout]", stripeErr.message);
      return res
        .status(500)
        .json({ message: "Payment setup failed. Please try again or pay at your appointment." });
    }
  });
});

/**
 * POST /api/payments/intent  (legacy — kept for backwards compatibility)
 * Creates a raw PaymentIntent rather than a hosted Checkout Session.
 */
router.post("/intent", requireAuth, async (req, res) => {
  const { amount, currency, booking_id } = req.body;

  if (!amount || !currency) {
    return res.status(400).json({ message: "Amount and currency are required." });
  }

  const amountNum = Number(amount);
  if (!Number.isInteger(amountNum) || amountNum < 50) {
    return res.status(400).json({ message: "Invalid payment amount." });
  }

  const validCurrencies = ["usd", "eur", "gbp"];
  if (!validCurrencies.includes(String(currency).toLowerCase())) {
    return res.status(400).json({ message: "Unsupported currency." });
  }

  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create({
      amount: amountNum,
      currency: String(currency).toLowerCase(),
      metadata: { booking_id: booking_id ? String(booking_id) : "" },
    });

    if (booking_id) {
      db.run(
        `INSERT INTO payments (booking_id, amount, currency, status, stripe_payment_intent_id)
         VALUES (?, ?, ?, ?, ?)`,
        [booking_id, amountNum, currency, intent.status, intent.id]
      );
    }

    return res.json({ clientSecret: intent.client_secret, id: intent.id });
  } catch (error) {
    console.error("[Stripe Intent]", error.message);
    return res.status(500).json({ message: "Payment processing error." });
  }
});

module.exports = router;
