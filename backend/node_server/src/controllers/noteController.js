// src/controllers/noteController.js
const mongoose = require('mongoose');
const Note = require('../models/Note');
const cacheService = require('../services/cacheService');
const websocketService = require('../services/websocketService');
const syncService = require('../services/syncService');
const PermissionService = require('../services/permissionService');
const logger = require('../config/logger');

/**
 * Helper: get canonical userId from req.user
 */
function getUserIdFromReq(req) {
  if (!req.user) return null;
  return String(req.user._id || req.user.id || req.user.userId);
}

/**
 * Encode/decode cursor
 */
function encodeCursor(obj) {
  try { return Buffer.from(JSON.stringify(obj)).toString('base64'); }
  catch { return null; }
}
function decodeCursor(cursor) {
  try { return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')); }
  catch { return null; }
}

/**
 * Create a note
 */
exports.createNote = async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { title = '', body = '', tags = [] } = req.body;
    const note = new Note({
      owner: mongoose.Types.ObjectId(userId),
      title,
      body,
      tags,
      version: 1
    });

    await note.save();

    // Invalidate cache
    await cacheService.invalidateForUsers(userId);

    // Emit WebSocket
    websocketService.emitToUser(userId, 'note:created', note.toJSON());

    return res.status(201).json({ note: note.toJSON() });
  } catch (err) {
    logger.error('createNote error: %s', err.stack || err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Get notes with cursor-based pagination
 */
exports.getNotes = async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const cursor = req.query.cursor || 'start';
    const cacheKey = `notes:${userId}:cursor:${cursor}:limit:${limit}`;

    // Try cache
    const cached = await cacheService.getJSON(cacheKey);
    if (cached) return res.json(cached);

    const query = { owner: mongoose.Types.ObjectId(userId), deleted: false };

    if (cursor && cursor !== 'start') {
      const c = decodeCursor(cursor);
      if (!c || !c.updatedAt || !c.id) return res.status(400).json({ error: 'Invalid cursor' });
      const date = new Date(c.updatedAt);
      const oid = mongoose.Types.ObjectId(c.id);
      query.$or = [
        { updatedAt: { $lt: date } },
        { updatedAt: date, _id: { $lt: oid } }
      ];
    }

    const docs = await Note.find(query).sort({ updatedAt: -1, _id: -1 }).limit(limit + 1).lean();

    let nextCursor = null;
    let results = docs;
    if (docs.length > limit) {
      const last = docs[limit - 1];
      nextCursor = encodeCursor({ updatedAt: last.updatedAt.toISOString(), id: last._id.toString() });
      results = docs.slice(0, limit);
    }

    const payload = { notes: results, nextCursor };

    // Cache
    await cacheService.setJSON(cacheKey, payload);
    await cacheService.addCacheKeyForUser(userId, cacheKey);

    return res.json(payload);
  } catch (err) {
    logger.error('getNotes error: %s', err.stack || err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Get single note (owner or shared)
 */
exports.getNoteById = async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const note = await Note.findById(id).lean();
    if (!note || note.deleted) return res.status(404).json({ error: 'Note not found' });

    // Permission check
    const role = await PermissionService.getRole(id, userId);
    if (!role) return res.status(403).json({ error: 'Access denied' });

    return res.json({ note });
  } catch (err) {
    logger.error('getNoteById error: %s', err.stack || err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Update note
 */
exports.updateNote = async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;
    const { title, body, tags, version, lastModifiedByClientId } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const note = await Note.findById(id);
    if (!note || note.deleted) return res.status(404).json({ error: 'Note not found' });

    // Permission check
    const role = note.hasPermission(userId, 'edit');
    if (!role || (role !== 'owner' && role !== 'edit')) return res.status(403).json({ error: 'Access denied' });

    // Version conflict
    if (typeof version === 'number' && version < (note.version || 0)) {
      return res.status(409).json({ error: 'Version conflict', serverNote: note.toJSON() });
    }

    if (typeof title === 'string') note.title = title;
    if (typeof body === 'string') note.body = body;
    if (Array.isArray(tags)) note.tags = tags;
    if (lastModifiedByClientId) note.lastModifiedByClientId = lastModifiedByClientId;

    note.bumpVersion();
    await note.save();

    const affectedUsers = [note.owner.toString(), ...(note.sharedWith?.map(s => s.user.toString()) || [])];
    await cacheService.invalidateForUsers(affectedUsers);
    affectedUsers.forEach(uid => websocketService.emitToUser(uid, 'note:updated', note.toJSON()));
    websocketService.emitToNote(note._id.toString(), 'note:updated', note.toJSON());

    return res.json({ note: note.toJSON() });
  } catch (err) {
    logger.error('updateNote error: %s', err.stack || err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Delete (soft) note
 */
exports.deleteNote = async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const note = await Note.findById(id);
    if (!note || note.deleted) return res.status(404).json({ error: 'Note not found' });

    const role = note.hasPermission(userId, 'edit');
    if (!role || (role !== 'owner' && role !== 'edit')) return res.status(403).json({ error: 'Access denied' });

    await note.softDelete();

    const affectedUsers = [note.owner.toString(), ...(note.sharedWith?.map(s => s.user.toString()) || [])];
    await cacheService.invalidateForUsers(affectedUsers);
    affectedUsers.forEach(uid => websocketService.emitToUser(uid, 'note:deleted', { id: note._id.toString() }));
    websocketService.emitToNote(note._id.toString(), 'note:deleted', { id: note._id.toString() });

    return res.json({ ok: true });
  } catch (err) {
    logger.error('deleteNote error: %s', err.stack || err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Sync batch changes from client
 */
exports.syncChanges = async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { changes } = req.body;
    if (!Array.isArray(changes)) return res.status(400).json({ error: 'Changes must be an array' });

    const results = await syncService.syncChanges(userId, changes);
    return res.json({ results });
  } catch (err) {
    logger.error('syncChanges error: %s', err.stack || err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
