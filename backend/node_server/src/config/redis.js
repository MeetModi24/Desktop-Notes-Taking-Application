// ioredis wrapper with pub/sub helper and simple health check
const IORedis = require('ioredis');
const logger = require('./logger');
const config = require('./env');

let redisClient = null;
let redisSubscriber = null;

function createClient() {
  if (redisClient) return redisClient;

  const options = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    lazyConnect: false,
    maxRetriesPerRequest: 2
  };

  redisClient = new IORedis(options);

  redisClient.on('connect', () => logger.info('Redis client connected'));
  redisClient.on('ready', () => logger.info('Redis client ready'));
  redisClient.on('error', (err) => logger.error('Redis error: %s', err.message));
  redisClient.on('close', () => logger.warn('Redis connection closed'));

  return redisClient;
}

// For pub/sub in multi-instance setups
function createSubscriber() {
  if (redisSubscriber) return redisSubscriber;
  const options = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined
  };
  redisSubscriber = new IORedis(options);

  redisSubscriber.on('connect', () => logger.info('Redis subscriber connected'));
  redisSubscriber.on('error', (err) => logger.error('Redis subscriber error: %s', err.message));

  return redisSubscriber;
}

async function healthCheck() {
  try {
    const client = createClient();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch (err) {
    logger.warn('Redis health check failed: %s', err.message);
    return false;
  }
}

async function quit() {
  try {
    if (redisSubscriber) {
      await redisSubscriber.quit();
      redisSubscriber = null;
    }
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
    }
    logger.info('Redis clients closed');
  } catch (err) {
    logger.error('Error closing Redis clients: %s', err.message);
  }
}

process.on('SIGINT', async () => {
  logger.info('SIGINT received — closing redis clients');
  await quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — closing redis clients');
  await quit();
  process.exit(0);
});

module.exports = {
  createClient,
  createSubscriber,
  healthCheck,
  quit
};
