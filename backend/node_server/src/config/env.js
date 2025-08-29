// Loads and validates environment variables. Export readable config object.
const dotenv = require('dotenv');
const path = require('path');

const result = dotenv.config({
  path: process.env.NODE_ENV === 'test' ? path.resolve(process.cwd(), '.env.test') : undefined
});

if (result.error) {
  // Not fatal: app might still run with some defaults, but warn loudly.
  // In production, ensure env is provided.
  console.warn('Warning: .env file not found or not loaded. Relying on system env variables.');
}

/**
 * Minimal validation helper
 */
function required(name, fallback) {
  const val = process.env[name] ?? fallback;
  if (!val) {
    throw new Error(`Environment variable ${name} is required but not set.`);
  }
  return val;
}

const config = {
  app: {
    name: process.env.APP_NAME || 'notes-app',
    env: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT || 4000),
  },
  mongo: {
    uri: required('MONGODB_URI'),
    user: process.env.MONGODB_USER || '',
    pass: process.env.MONGODB_PASS || ''
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || ''
  },
  jwt: {
    secret: required('JWT_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },
  log: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

module.exports = config;
