/**
 * d4gcutz — Root entry point for Hostinger Node.js hosting.
 *
 * This file exists so Hostinger (and similar hosts) can start the app
 * directly from the project root without `cd` commands.
 *
 * All logic lives in backend/server.js — this is just a bootstrap wrapper.
 */
require("./backend/server.js");
