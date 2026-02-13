/**
 * d4gcutz — Root entry point for Hostinger Node.js hosting.
 *
 * This file exists so Hostinger (and similar hosts) can start the app
 * directly from the project root without `cd` commands.
 *
 * All logic lives in backend/server.js, but we wrap startup so the process
 * does not silently crash-loop (which surfaces as host-level 503).
 */

let fallbackStarted = false;
const startFallbackServer = (cause = "unknown") => {
  if (fallbackStarted) return;
  fallbackStarted = true;

  // Fallback server keeps the process alive and returns diagnostic responses
  // instead of hard 503 from the platform reverse proxy.
  const express = require("express");
  const app = express();
  const port = process.env.PORT || 3000;

  app.get("/api/health", (_req, res) => {
    return res.status(500).json({
      status: "degraded",
      message: "Startup/runtime failure in backend/server.js",
      cause,
    });
  });

  app.use((_req, res) => {
    return res.status(500).json({ message: "Service is running in degraded mode." });
  });

  app.listen(port, () => {
    console.error(`[Bootstrap] Fallback server listening on port ${port} (cause: ${cause})`);
  });
};

// Register process-level handlers as early as possible (before backend imports)
process.on("unhandledRejection", (reason) => {
  console.error("[Bootstrap] Unhandled promise rejection:", reason);
  startFallbackServer("unhandledRejection");
});

process.on("uncaughtException", (error) => {
  console.error("[Bootstrap] Uncaught exception:", error);
  startFallbackServer("uncaughtException");
});

try {
  require("./backend/server.js");
} catch (error) {
  console.error("[Bootstrap] Failed to start backend/server.js:", error);
  startFallbackServer("startupRequireFailure");
}
