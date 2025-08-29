// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const noteRoutes = require('./routes/noteRoutes');
// const userRoutes = require('./routes/userRoutes');

const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');

const app = express();

// ----------------------
// Middleware
// ----------------------
app.use(helmet());
app.use(cors({
  origin: true, // allow Electron frontend
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Rate limiter for all API routes
app.use('/api', rateLimiter);

// ----------------------
// Routes
// ----------------------
app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);
// app.use('/api/users', userRoutes); // user settings, preferences

// Health check endpoint
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));

// ----------------------
// Error handling middleware
// ----------------------
app.use(errorHandler);

module.exports = app;
