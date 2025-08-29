// src/services/syncService.js
// Applies client-side changes in a batch and resolves conflicts using version checks.
// Changes format: [{ op: 'create'|'update'|'delete', localId?, note: { ... } }]
// Returns results: [{ localId?, id?, status: 'ok'|'conflict'|'error', serverNote?, error? }]

const mongoose = require('mongoose');
const Note = require('../models/Note');
const logger = require('../config/logger');
const websocketService = require('./websocketService');
const cacheService = require('./cacheService');


async function applyCreate(userId, change) {
  const { note } = change;
  const doc = new Note({
    owner: mongoose.Types.ObjectId(userId),
    title: note.title || '',
    body: note.body || '',
    tags: Array.isArray(note.tags) ? note.tags : [],
    version: typeof note.version === 'number' ? note.version : 1,
    lastModifiedByClientId: note.lastModifiedByClientId || null
  });
  await doc.save();

  // Invalidate cache for all affected users (owner + sharedWith)
  const affectedUsers = [doc.owner.toString(), ...(doc.sharedWith?.map(s => s.user.toString()) || [])];
  await cacheService.invalidateForUsers(affectedUsers);

  // Emit to all affected users
  affectedUsers.forEach(uid => websocketService.emitToUser(uid, 'note:created', doc.toJSON()));

  return { localId: change.localId, id: doc._id.toString(), status: 'ok', serverNote: doc.toJSON() };
}

async function applyUpdate(userId, change) {
  const { note } = change;
  if (!note || !note.id) return { localId: change.localId, status: 'error', error: 'id required for update' };

  const doc = await Note.findOne({ _id: note.id, deleted: false }).exec();
  if (!doc) return { localId: change.localId, id: note.id, status: 'error', error: 'note not found' };

  // Permission check
  const perm = doc.hasPermission(userId, 'edit');
  if (!perm || (perm !== 'owner' && perm !== 'edit')) {
    return { localId: change.localId, id: note.id, status: 'error', error: 'no permission' };
  }

  // Version check
  if (typeof note.version === 'number' && note.version < (doc.version || 0)) {
    return { localId: change.localId, id: note.id, status: 'conflict', serverNote: doc.toJSON() };
  }

  // Apply fields
  if (typeof note.title === 'string') doc.title = note.title;
  if (typeof note.body === 'string') doc.body = note.body;
  if (Array.isArray(note.tags)) doc.tags = note.tags;
  doc.lastModifiedByClientId = note.lastModifiedByClientId || doc.lastModifiedByClientId;
  doc.bumpVersion();
  await doc.save();

  // Invalidate cache and emit to all users with access
  const affectedUsers = [doc.owner.toString(), ...(doc.sharedWith?.map(s => s.user.toString()) || [])];
  await cacheService.invalidateForUsers(affectedUsers);
  affectedUsers.forEach(uid => websocketService.emitToUser(uid, 'note:updated', doc.toJSON()));
  websocketService.emitToNote(doc._id.toString(), 'note:updated', doc.toJSON());

  return { localId: change.localId, id: note.id, status: 'ok', serverNote: doc.toJSON() };
}

async function applyDelete(userId, change) {
  const { note } = change;
  if (!note || !note.id) return { localId: change.localId, status: 'error', error: 'id required for delete' };

  const doc = await Note.findOne({ _id: note.id, deleted: false }).exec();
  if (!doc) return { localId: change.localId, id: note.id, status: 'error', error: 'note not found' };

  // Permission check
  const perm = doc.hasPermission(userId, 'edit');
  if (!perm || (perm !== 'owner' && perm !== 'edit')) {
    return { localId: change.localId, id: note.id, status: 'error', error: 'no permission' };
  }

  doc.softDelete();

  const affectedUsers = [doc.owner.toString(), ...(doc.sharedWith?.map(s => s.user.toString()) || [])];
  await cacheService.invalidateForUsers(affectedUsers);
  affectedUsers.forEach(uid => websocketService.emitToUser(uid, 'note:deleted', { id: doc._id.toString() }));
  websocketService.emitToNote(doc._id.toString(), 'note:deleted', { id: doc._id.toString() });

  return { localId: change.localId, id: note.id, status: 'ok' };
}


/**
 * Main sync function
 * - userId: string
 * - changes: array
 * Returns: results array same length as changes
 */
async function syncChanges(userId, changes = []) {
  const results = [];
  for (const change of changes) {
    try {
      if (!change || !change.op) {
        results.push({ localId: change.localId, status: 'error', error: 'invalid change' });
        continue;
      }
      if (change.op === 'create') {
        const r = await applyCreate(userId, change);
        results.push(r);
      } else if (change.op === 'update') {
        const r = await applyUpdate(userId, change);
        results.push(r);
      } else if (change.op === 'delete') {
        const r = await applyDelete(userId, change);
        results.push(r);
      } else {
        results.push({ localId: change.localId, status: 'error', error: 'unknown op' });
      }
    } catch (err) {
      logger.error('syncChange apply error: %s', err.stack || err.message);
      results.push({ localId: change.localId, status: 'error', error: err.message });
    }
  }
  return results;
}

module.exports = {
  syncChanges,
  // export individual functions for tests or controller usage
  applyCreate,
  applyUpdate,
  applyDelete
};
