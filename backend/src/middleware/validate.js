/**
 * Input sanitization and validation helpers.
 */

/**
 * Sanitize a string: trim whitespace and strip HTML tags.
 */
const sanitizeString = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/<[^>]*>/g, "");
};

/**
 * Validate email format.
 */
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
};

/**
 * Validate password strength.
 * At least 8 characters, 1 letter, 1 number.
 */
const isStrongPassword = (password) => {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    /[a-zA-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
};

/**
 * Sanitize all string fields in a request body (shallow).
 */
const sanitizeBody = (req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === "string") {
        req.body[key] = sanitizeString(req.body[key]);
      }
    }
  }
  next();
};

module.exports = { sanitizeString, isValidEmail, isStrongPassword, sanitizeBody };
