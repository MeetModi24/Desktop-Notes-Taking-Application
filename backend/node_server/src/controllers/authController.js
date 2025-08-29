// src/controllers/authController.js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Helpers
 */
function signAccessToken(user) {
  // Payload: subject + role, expiry from config
  const payload = { sub: user._id.toString(), role: user.role };
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.accessExpiresIn });
}

function generateRefreshTokenPlain() {
  // Returns a strong random token string (plaintext)
  return crypto.randomBytes(64).toString('hex');
}

function hashToken(tokenPlain) {
  return crypto.createHash('sha256').update(tokenPlain).digest('hex');
}

function parseRefreshExpiryToDate(expStr) {
  // support formats like '30d', '1d', '12h', '15m' or numeric ms fallback
  if (!expStr) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const m = String(expStr).trim().toLowerCase().match(/^(\d+)(d|h|m|s)?$/);
  if (!m) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const n = Number(m[1]);
  const unit = m[2] || 'd';
  const multipliers = { d: 24 * 60 * 60 * 1000, h: 60 * 60 * 1000, m: 60 * 1000, s: 1000 };
  return new Date(Date.now() + n * (multipliers[unit] || multipliers.d));
}

/**
 * Create & persist a refresh token (store hashed)
 * returns { refreshToken: <plaintext>, expiresAt: Date }
 */
async function createAndStoreRefreshToken(userId, deviceInfo = null) {
  const plain = generateRefreshTokenPlain();
  const hashed = hashToken(plain);
  const expiresAt = parseRefreshExpiryToDate(config.jwt.refreshExpiresIn);

  const doc = new RefreshToken({
    user: mongoose.Types.ObjectId(userId),
    tokenHash: hashed,
    deviceInfo: deviceInfo || null,
    expiresAt,
    revoked: false
  });

  await doc.save();
  return { refreshToken: plain, expiresAt };
}

/**
 * Controller: signup
 * - ensures unique username/email
 * - uses User.setPassword (model method) to hash password
 * - returns user and tokens
 */
exports.signup = async (req, res) => {
  try {
    const { username, email, password, deviceInfo } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    // Check existing by username/email
    const existing = await User.findOne({
      $or: [{ username: username.trim().toLowerCase() }, ...(email ? [{ email: email.trim().toLowerCase() }] : [])]
    });
    if (existing) {
      return res.status(409).json({ error: 'Username or email already in use' });
    }

    const user = new User({ username, email });
    await user.setPassword(password); // model's instance method
    await user.save();

    // Issue tokens
    const accessToken = signAccessToken(user);
    const { refreshToken } = await createAndStoreRefreshToken(user._id, deviceInfo);

    return res.status(201).json({
      user: user.toJSON(),
      tokens: {
        accessToken,
        refreshToken
      }
    });
  } catch (err) {
    logger.error('signup error: %s', err.stack || err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Controller: login
 * - accepts username or email for convenience
 * - verifies password via model's verifyPassword
 * - issues access + refresh tokens
 */
exports.login = async (req, res) => {
  try {
    const { identifier, password, deviceInfo } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'identifier and password required' });
    }

    // Allow either username or email
    const q = String(identifier).includes('@')
      ? { email: String(identifier).trim().toLowerCase() }
      : { username: String(identifier).trim().toLowerCase() };

    const user = await User.findOne(q);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await user.verifyPassword(password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken = signAccessToken(user);
    const { refreshToken } = await createAndStoreRefreshToken(user._id, deviceInfo);

    return res.json({
      user: user.toJSON(),
      tokens: {
        accessToken,
        refreshToken
      }
    });
  } catch (err) {
    logger.error('login error: %s', err.stack || err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Controller: refreshToken
 * - rotate refresh token: verify incoming plaintext, revoke old, store new
 * - response contains new accessToken + new refreshToken
 *
 * Expected body: { refreshToken: "<plain>" }
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken: incoming } = req.body;
    if (!incoming) return res.status(400).json({ error: 'refreshToken required' });

    const hashed = hashToken(incoming);
    const tokenDoc = await RefreshToken.findOne({ tokenHash: hashed });

    if (!tokenDoc || tokenDoc.revoked) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (tokenDoc.expiresAt && tokenDoc.expiresAt < new Date()) {
      // Mark revoked if expired
      tokenDoc.revoked = true;
      await tokenDoc.save().catch(() => {});
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    const user = await User.findById(tokenDoc.user);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Revoke current token (rotate)
    tokenDoc.revoked = true;
    await tokenDoc.save();

    const accessToken = signAccessToken(user);
    const { refreshToken: newRefreshPlain } = await createAndStoreRefreshToken(user._id, tokenDoc.deviceInfo);

    return res.json({
      user: user.toJSON(),
      tokens: {
        accessToken,
        refreshToken: newRefreshPlain
      }
    });
  } catch (err) {
    logger.error('refreshToken error: %s', err.stack || err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Controller: logout
 * - revoke provided refresh token, or revoke all tokens for user if none provided
 * - expected to be protected route (req.user available)
 */
exports.logout = async (req, res) => {
  try {
    const userId = req.user && (req.user._id || req.user.id || req.user.userId);
    const { refreshToken: incoming } = req.body;

    if (incoming) {
      const hashed = hashToken(incoming);
      await RefreshToken.findOneAndUpdate({ tokenHash: hashed }, { revoked: true }).exec();
      return res.json({ ok: true });
    }

    if (!userId) {
      return res.status(400).json({ error: 'No refresh token provided and no authenticated user' });
    }

    // Revoke all refresh tokens for user
    await RefreshToken.updateMany({ user: mongoose.Types.ObjectId(userId) }, { revoked: true }).exec();
    return res.json({ ok: true });
  } catch (err) {
    logger.error('logout error: %s', err.stack || err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Controller: getMe (optional helper)
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
