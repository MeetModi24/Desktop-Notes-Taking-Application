// src/routes/noteRoutes.js
const express = require('express');
const router = express.Router();

const noteController = require('../controllers/noteController');
const syncService = require('../services/syncService');
const authMiddleware = require('../middleware/authMiddleware');
const rateLimiter = require('../middleware/rateLimiter');
const permissionService = require('../services/permissionService');
const Invite = require('../models/Invite');
const websocketService = require('../services/websocketService');

/**
 * ========================
 * Protected Routes (JWT required)
 * ========================
 */
router.use(authMiddleware); // all routes below require JWT
router.use(rateLimiter);    // apply rate limiting

/**
 * Create a new note
 */
router.post('/', async (req, res, next) => {
  try {
    await noteController.createNote(req, res);
  } catch (err) {
    next(err);
  }
});

/**
 * Get notes with cursor-based pagination (lazy loading)
 */
router.get('/', async (req, res, next) => {
  try {
    await noteController.getNotes(req, res);
  } catch (err) {
    next(err);
  }
});

/**
 * Get a single note by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    await noteController.getNoteById(req, res);
  } catch (err) {
    next(err);
  }
});

/**
 * Update note
 */
router.put('/:id', async (req, res, next) => {
  try {
    await noteController.updateNote(req, res);
  } catch (err) {
    next(err);
  }
});

/**
 * Soft delete note
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await noteController.deleteNote(req, res);
  } catch (err) {
    next(err);
  }
});

/**
 * Share note directly with user
 */
router.post('/:id/share', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { targetUserId, permission } = req.body;
    const noteId = req.params.id;

    const note = await permissionService.shareNote(noteId, userId, targetUserId, permission);
    return res.json({ note: note.toJSON ? note.toJSON() : note });
  } catch (err) {
    next(err);
  }
});

/**
 * Revoke access
 */
router.post('/:id/revoke', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.body;
    const noteId = req.params.id;

    const note = await permissionService.revokeAccess(noteId, userId, targetUserId);
    return res.json({ note: note.toJSON ? note.toJSON() : note });
  } catch (err) {
    next(err);
  }
});

/**
 * Set note public/private
 */
router.post('/:id/public', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { isPublic } = req.body;
    const noteId = req.params.id;

    const note = await permissionService.setPublic(noteId, userId, isPublic);
    return res.json({ note: note.toJSON ? note.toJSON() : note });
  } catch (err) {
    next(err);
  }
});

/**
 * List users a note is shared with
 */
router.get('/:id/permissions', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;

    const sharedUsers = await permissionService.listPermissions(noteId, userId);
    return res.json({ sharedUsers });
  } catch (err) {
    next(err);
  }
});

/**
 * Sync multiple changes (offline support)
 */
router.post('/sync', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { changes } = req.body;
    if (!Array.isArray(changes)) {
      return res.status(400).json({ error: 'changes must be an array' });
    }

    const results = await syncService.syncChanges(userId, changes);
    return res.json({ results });
  } catch (err) {
    next(err);
  }
});

/**
 * Create an invite for a note (share via link/email)
 */
router.post('/:id/invite', async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const noteId = req.params.id;
    const { permission = 'read', email = null, ttlMs = null } = req.body;

    const { invite, token } = await Invite.createInvite({
      noteId,
      inviterId: ownerId,
      permission,
      email,
      ttlMs
    });

    // Optional: notify invitee via WebSocket if email linked to user exists
    if (email) {
      // Find user by email and emit event
      // websocketService.emitToUser(targetUserId, 'note:invite', { noteId, inviteToken: token });
    }

    return res.json({ inviteId: invite._id, token });
  } catch (err) {
    next(err);
  }
});

/**
 * Accept an invite (by token)
 */
router.post('/invite/accept', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { token, email } = req.body;

    const invite = await Invite.consumeInvite(token, userId, email);

    // Grant permission to the user
    const note = await permissionService.shareNote(
      invite.note,
      invite.inviter,
      userId,
      invite.permission
    );

    // Notify via WebSocket
    websocketService.emitToUser(userId, 'note:shared', {
      noteId: invite.note.toString(),
      permission: invite.permission
    });

    return res.json({ note: note.toJSON ? note.toJSON() : note });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
