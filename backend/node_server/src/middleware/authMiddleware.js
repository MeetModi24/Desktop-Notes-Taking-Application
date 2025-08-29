// middleware/authMiddleware.js
const authService = require('../services/authService');
const User = require('../models/User');
const logger = require('../config/logger');

/**
 * Middleware to protect routes.
 * Extracts Bearer token, verifies it, and attaches user to req.user
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token missing' });
    }

    const token = authHeader.split(' ')[1];
    const { valid, payload, expired, error } = authService.verifyAccessToken(token);

    if (!valid) {
      if (expired) return res.status(401).json({ error: 'Token expired' });
      logger.warn('Invalid token: %s', error?.message || error);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await User.findById(payload.sub).select('-password');
    if (!user) return res.status(401).json({ error: 'User not found' });

    req.user = user; // attach full user object without password
    next();
  } catch (err) {
    logger.error('Auth middleware error: %s', err.stack || err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;
