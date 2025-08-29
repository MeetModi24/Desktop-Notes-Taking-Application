// src/controllers/authController.js
const logger = require('../config/logger');
const authService = require('../services/authService');

/**
 * Controller: signup
 * Uses authService.signup() for all heavy-lifting
 */
exports.signup = async (req, res) => {
  try {
    const { username, email, password, deviceInfo } = req.body;
    const result = await authService.signup({ username, email, password, deviceInfo });
    return res.status(201).json(result);
  } catch (err) {
    logger.error('signup error: %s', err.stack || err.message);
    // Handle known errors with proper status codes
    if (err.message.includes('in use')) return res.status(409).json({ error: err.message });
    if (err.message.includes('required')) return res.status(400).json({ error: err.message });
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Controller: login
 * Uses authService.login()
 */
exports.login = async (req, res) => {
  try {
    const { identifier, password, deviceInfo } = req.body;
    const result = await authService.login({ identifier, password, deviceInfo });
    return res.json(result);
  } catch (err) {
    logger.error('login error: %s', err.stack || err.message);
    return res.status(401).json({ error: err.message });
  }
};

/**
 * Controller: refreshToken
 * Rotate refresh token, revoke old, issue new via authService.rotateRefreshToken()
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

    const result = await authService.rotateRefreshToken(refreshToken);
    return res.json({
      user: result.user,
      tokens: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      }
    });
  } catch (err) {
    logger.error('refreshToken error: %s', err.stack || err.message);
    return res.status(401).json({ error: err.message });
  }
};

/**
 * Controller: logout
 * Revoke a single refresh token or all tokens for the user
 */
exports.logout = async (req, res) => {
  try {
    const userId = req.user && (req.user._id || req.user.id || req.user.userId);
    const { refreshToken } = req.body;

    if (refreshToken) {
      await authService.revokeRefreshToken(refreshToken);
    } else if (userId) {
      await authService.revokeAllForUser(userId);
    } else {
      return res.status(400).json({ error: 'No refresh token or authenticated user' });
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.error('logout error: %s', err.stack || err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Controller: getMe
 * Returns authenticated user info from req.user
 */
exports.getMe = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    return res.json({ user: user.toJSON ? user.toJSON() : user });
  } catch (err) {
    logger.error('getMe error: %s', err.stack || err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
