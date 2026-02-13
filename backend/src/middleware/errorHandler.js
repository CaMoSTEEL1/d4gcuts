/**
 * Global error handling middleware.
 * Catches unhandled errors and returns a clean JSON response.
 * In production, stack traces are hidden from the client.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  // CORS errors
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ message: "Origin not allowed by CORS policy" });
  }

  console.error("[Error]", err.stack || err.message || err);

  const status = err.status || err.statusCode || 500;
  const response = {
    message: err.message || "Internal server error",
  };

  // Only include stack trace in development
  if (process.env.NODE_ENV !== "production") {
    response.stack = err.stack;
  }

  return res.status(status).json(response);
};

module.exports = errorHandler;
