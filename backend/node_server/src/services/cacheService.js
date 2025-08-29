// src/services/cacheService.js
// Redis helpers and per-user cache-key tracking for invalidation.

const { createClient } = require('../config/redis');
const logger = require('../config/logger');

const redis = createClient();

// Key conventions:
const USER_CACHEKEY_SET = (userId) => `notes:cachekeys:user:${userId}`;

/**
 * setJSON(key, value, ttlSeconds)
 */
async function setJSON(key, value, ttlSeconds = 60) {
  try {
    const str = JSON.stringify(value);
    if (typeof ttlSeconds === 'number' && ttlSeconds > 0) {
      await redis.set(key, str, 'EX', ttlSeconds);
    } else {
      await redis.set(key, str);
    }
    return true;
  } catch (err) {
    logger.warn('cache.setJSON failed %s', err.message);
    return false;
  }
}

async function getJSON(key) {
  try {
    const v = await redis.get(key);
    if (!v) return null;
    return JSON.parse(v);
  } catch (err) {
    logger.warn('cache.getJSON failed %s', err.message);
    return null;
  }
}

async function del(...keys) {
  try {
    if (!keys || keys.length === 0) return 0;
    return await redis.del(...keys);
  } catch (err) {
    logger.warn('cache.del failed %s', err.message);
    return 0;
  }
}

/**
 * Track cache keys per-user in a Redis SET for invalidation.
 */
async function addCacheKeyForUser(userId, cacheKey) {
  try {
    const setKey = USER_CACHEKEY_SET(userId);
    await redis.sadd(setKey, cacheKey);
    const ttl = await redis.ttl(setKey);
    if (ttl < 0) {
    await redis.expire(setKey, 24 * 60 * 60);
    }
  } catch (err) {
    logger.warn('addCacheKeyForUser failed: %s', err.message);
  }
}

/**
 * Invalidate all cache keys tracked for one or multiple users.
 * Accepts userId (string) or array of userIds.
 */
async function invalidateForUsers(userIds = []) {
  if (!userIds) return;
  const arr = Array.isArray(userIds) ? userIds : [userIds];
  try {
    for (const u of arr) {
      const setKey = USER_CACHEKEY_SET(u);
      const members = await redis.smembers(setKey);
      if (members && members.length) {
        await redis.del(...members);
      }
      await redis.del(setKey);
    }
  } catch (err) {
    logger.warn('invalidateForUsers failed: %s', err.message);
  }
}

module.exports = {
  setJSON,
  getJSON,
  del,
  addCacheKeyForUser,
  invalidateForUsers,
  redisClient: redis
};
