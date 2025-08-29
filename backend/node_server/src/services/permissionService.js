// services/permissionService.js
const Note = require("../models/Note");
const websocketService = require("./websocketService");

class PermissionService {
  /**
   * Share a note with another user
   * @param {String} noteId
   * @param {String} ownerId
   * @param {String} targetUserId
   * @param {"read"|"edit"} permission
   */
  static async shareNote(noteId, ownerId, targetUserId, permission = "read") {
    const note = await Note.findById(noteId);
    if (!note) throw new Error("Note not found");

    if (String(note.owner) !== String(ownerId)) {
      throw new Error("Only the owner can share this note");
    }

    await note.shareWith(targetUserId, permission);

    // Notify target user via WebSocket
    websocketService.notifyUser(targetUserId, {
      type: "note:shared",
      noteId: note._id.toString(),
      permission,
    });

    return note;
  }

  /**
   * Revoke access for a user
   */
  static async revokeAccess(noteId, ownerId, targetUserId) {
    const note = await Note.findById(noteId);
    if (!note) throw new Error("Note not found");

    if (String(note.owner) !== String(ownerId)) {
      throw new Error("Only the owner can revoke access");
    }

    await note.unshareWith(targetUserId);

    websocketService.notifyUser(targetUserId, {
      type: "note:access-revoked",
      noteId: note._id.toString(),
    });

    return note;
  }

  /**
   * Check if a user has a given permission on a note
   * Returns boolean
   */
  static async hasPermission(noteId, userId, required = "read") {
    const note = await Note.findById(noteId);
    if (!note) return false;
    return note.hasPermission(userId, required) !== null;
  }

  /**
   * Get the effective role: 'owner' | 'edit' | 'read' | 'public' | null
   */
  static async getRole(noteId, userId, required = "read") {
    const note = await Note.findById(noteId);
    if (!note) return null;
    return note.hasPermission(userId, required);
  }

  /**
   * List all users the note is shared with
   */
  static async listPermissions(noteId, ownerId) {
    const note = await Note.findById(noteId).populate(
      "sharedWith.user",
      "username email"
    );
    if (!note) throw new Error("Note not found");

    if (String(note.owner) !== String(ownerId)) {
      throw new Error("Only the owner can list permissions");
    }

    return note.listSharedUsers();
  }

  /**
   * Make note public or private
   */
  static async setPublic(noteId, ownerId, isPublic = true) {
    const note = await Note.findById(noteId);
    if (!note) throw new Error("Note not found");

    if (String(note.owner) !== String(ownerId)) {
      throw new Error("Only the owner can toggle public access");
    }

    note.isPublic = Boolean(isPublic);
    await note.save();

    return note;
  }
}

module.exports = PermissionService;
