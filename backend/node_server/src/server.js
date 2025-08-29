// src/server.js
require('dotenv').config(); // load .env variables
const http = require('http');
const mongoose = require('mongoose');
const { createClient } = require('./config/redis');
const app = require('./app');
const websocketService = require('./services/websocketService');
const logger = require('./config/logger');
const config = require('./config/env');

// ----------------------
// MongoDB connection
// ----------------------
mongoose.connect(config.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  logger.info('MongoDB connected');
}).catch(err => {
  logger.error('MongoDB connection error: %s', err.message);
  process.exit(1);
});

// ----------------------
// Redis connection
// ----------------------
const redisClient = createClient();
redisClient.connect().then(() => {
  logger.info('Redis connected');
}).catch(err => {
  logger.warn('Redis connection failed: %s', err.message);
});

// ----------------------
// Start HTTP server
// ----------------------
const server = http.createServer(app);

// ----------------------
// Initialize WebSocket server
// ----------------------
websocketService.initSocketServer(server);

// ----------------------
// Start listening
// ----------------------
const PORT = config.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});
