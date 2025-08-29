// middleware/rateLimiter.js
const rateLimit = require("express-rate-limit");

// IP-based limiter (can also extend to user-specific if req.user exists)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => {
    return req.user ? req.user._id.toString() : req.ip; // per-user or fallback to IP
  },
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = limiter;
