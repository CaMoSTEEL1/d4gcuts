const express = require("express");
const { db } = require("../db/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Lazy-init Stripe only when needed (avoids crash if key not set)
let stripeInstance = null;
const getStripe = () => {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET;
    if (!key) {
      throw new Error("Stripe secret key is not configured.");
    }
    stripeInstance = require("stripe")(key);
  }
  return stripeInstance;
};

router.post("/intent", requireAuth, async (req, res) => {
  const { amount, currency, booking_id } = req.body;

  if (!amount || !currency) {
    return res.status(400).json({ message: "Amount and currency are required." });
  }

  // Validate amount is a positive integer (cents)
  const amountNum = Number(amount);
  if (!Number.isInteger(amountNum) || amountNum < 50) {
    return res.status(400).json({ message: "Invalid payment amount." });
  }

  // Validate currency
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
    console.error("[Stripe Error]", error.message);
    return res.status(500).json({ message: "Payment processing error." });
  }
});

module.exports = router;
