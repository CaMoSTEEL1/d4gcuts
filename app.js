/**
 * d4gcutz — Root entry point for Hostinger Node.js hosting.
 *
 * This file exists so Hostinger (and similar hosts) can start the app
 * directly from the project root without `cd` commands.
 *
 * All logic lives in backend/server.js, but we wrap startup so the process
 * does not silently crash-loop (which surfaces as host-level 503).
 */

// Register process-level handlers as early as possible (before backend imports)
process.on("unhandledRejection", (reason) => {
  console.error("[Bootstrap] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[Bootstrap] Uncaught exception:", error);
});

try {
  require("./backend/server.js");
} catch (error) {
  // Fallback server keeps the process alive and returns diagnostic responses
  // instead of hard 503 from the platform reverse proxy.
  console.error("[Bootstrap] Failed to start backend/server.js:", error);

  const express = require("express");
  const app = express();
  const port = process.env.PORT || 3000;

  app.get("/api/health", (_req, res) => {
    return res.status(500).json({
      status: "degraded",
      message: "Startup failure in backend/server.js",
    });
  });

  app.use((_req, res) => {
    return res.status(500).json({ message: "Service is starting in degraded mode." });
  });

  app.listen(port, () => {
    console.error(`[Bootstrap] Fallback server listening on port ${port}`);
  });
}
