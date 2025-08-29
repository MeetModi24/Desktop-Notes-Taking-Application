// Mongoose connection wrapper + graceful shutdown
const mongoose = require('mongoose');
const logger = require('./logger');
const config = require('./env');

const DEFAULT_OPTIONS = {
  // Mongoose 7+ has sensible defaults, but configure retryWrites, watchers etc. as needed.
  // Keep auth optional by leaving user/pass blank if not provided.
  autoIndex: false, // production recommendation
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
};

let isConnectedBefore = false;

async function connect() {
  const opts = { ...DEFAULT_OPTIONS };
  if (config.mongo.user) {
    opts.user = config.mongo.user;
    opts.pass = config.mongo.pass;
  }

  const uri = config.mongo.uri;

  mongoose.connection.on('connected', () => {
    isConnectedBefore = true;
    logger.info('MongoDB connected');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error: %s', err.message);
  });

  try {
    await mongoose.connect(uri, opts);
    logger.info('Mongoose initial connect success');
  } catch (err) {
    logger.error('Mongoose initial connect failed: %s', err.message);
    // exponential backoff retry loop
    await retryConnect(uri, opts);
  }
}

async function retryConnect(uri, opts, retries = 0) {
  const maxRetries = 5;
  const delayMs = Math.min(1000 * Math.pow(2, retries), 30000); // exponential backoff
  if (retries >= maxRetries) {
    logger.error('Exceeded max MongoDB connection retries');
    throw new Error('MongoDB connection failed after retries');
  }
  logger.info('Retrying MongoDB connection in %d ms (attempt %d)', delayMs, retries + 1);
  await new Promise((res) => setTimeout(res, delayMs));
  try {
    await mongoose.connect(uri, opts);
    logger.info('Mongoose reconnected on retry %d', retries + 1);
  } catch (err) {
    logger.warn('Retry %d failed: %s', retries + 1, err.message);
    return retryConnect(uri, opts, retries + 1);
  }
}

async function close() {
  try {
    await mongoose.disconnect();
    logger.info('Mongoose disconnected gracefully');
  } catch (err) {
    logger.error('Error during mongoose disconnect: %s', err.message);
  }
}

process.on('SIGINT', async () => {
  logger.info('SIGINT received — closing mongoose connection');
  await close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — closing mongoose connection');
  await close();
  process.exit(0);
});

module.exports = {
  connect,
  close
};
