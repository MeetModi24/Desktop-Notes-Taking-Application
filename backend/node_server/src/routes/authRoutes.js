// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const rateLimiter = require('../middleware/rateLimiter');

/**
 * ========================
 * Public Routes
 * ========================
 */

// Signup - create new user
router.post('/signup', rateLimiter, async (req, res, next) => {
  try {
    await authController.signup(req, res);
  } catch (err) {
    next(err);
  }
});

// Login - authenticate user and return JWT + refresh token
router.post('/login', rateLimiter, async (req, res, next) => {
  try {
    await authController.login(req, res);
  } catch (err) {
    next(err);
  }
});

// Refresh token - get new access token
router.post('/refresh-token', rateLimiter, async (req, res, next) => {
  try {
    await authController.refreshToken(req, res);
  } catch (err) {
    next(err);
  }
});

/**
 * ========================
 * Protected Routes (JWT required)
 * ========================
 */

// Logout - invalidate refresh token
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    await authController.logout(req, res);
  } catch (err) {
    next(err);
  }
});

// Get current user profile
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    await authController.getMe(req, res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
