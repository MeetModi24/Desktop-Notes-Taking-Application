/**
 * Note model (updated)
 * - owner: ObjectId -> User
 * - title, body
 * - tags: array of strings
 * - version: integer (client-managed for sync/conflict resolution)
 * - deleted: soft-delete flag
 * - sharedWith: [{ user, permission }] where permission in ['read','edit']
 * - isPublic: boolean (public-read toggle)
 *
 * Includes instance helpers:
 *  - hasPermission(userId, required) -> 'owner'|'edit'|'read'|null
 *  - shareWith(userId, permission)
 *  - unshareWith(userId)
 *  - listSharedUsers()
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const SharedWithSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    permission: { type: String, enum: ['read', 'edit'], default: 'read' },
    sharedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const NoteSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: '' },
    body: { type: String, default: '' },
    tags: { type: [String], default: [] },
    version: { type: Number, default: 1 }, // application-level version
    deleted: { type: Boolean, default: false, index: true },
    lastModifiedByClientId: { type: String, default: null }, // optional for client-side sync

    // Sharing fields
    sharedWith: { type: [SharedWithSchema], default: [] },
    isPublic: { type: Boolean, default: false }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
NoteSchema.index({ owner: 1, updatedAt: -1 });
NoteSchema.index({ title: 'text', body: 'text' });
// index for fast reverse lookup of notes shared to a user
NoteSchema.index({ 'sharedWith.user': 1 });

/**
 * Permission resolution
 * Returns:
 *  - 'owner'   => user is the owner
 *  - 'edit'    => user has edit permission
 *  - 'read'    => user has read permission
 *  - 'public'  => note is public (and required <= 'read')
 *  - null      => no access
 */
NoteSchema.methods.hasPermission = function (userId, required = 'read') {
  // normalize required to 'read' or 'edit'
  const levels = { read: 1, edit: 2 };
  const need = levels[required] || levels.read;

  const uid = (userId && String(userId)) || null;
  if (!uid) return null;

  // owner check
  if (String(this.owner) === uid) return 'owner';

  // public check
  if (this.isPublic && need <= levels.read) return 'public';

  // sharedWith check
  if (Array.isArray(this.sharedWith) && this.sharedWith.length) {
    for (const s of this.sharedWith) {
      if (!s || !s.user) continue;
      if (String(s.user) === uid) {
        if ((s.permission === 'edit' && need <= levels.edit) || (s.permission === 'read' && need <= levels.read)) {
          return s.permission === 'edit' ? 'edit' : 'read';
        }
        return null;
      }
    }
  }

  return null;
};

/**
 * Share note with a user (adds or updates permission)
 * - userId: ObjectId or string
 * - permission: 'read'|'edit'
 */
NoteSchema.methods.shareWith = async function (userId, permission = 'read') {
  if (!userId) throw new Error('userId required');
  const uid = String(userId);

  // remove any existing
  this.sharedWith = (this.sharedWith || []).filter((s) => String(s.user) !== uid);

  // push new share
  this.sharedWith.push({ user: mongoose.Types.ObjectId(uid), permission: permission === 'edit' ? 'edit' : 'read', sharedAt: new Date() });
  return this.save();
};

/**
 * Unshare note with a user
 */
NoteSchema.methods.unshareWith = async function (userId) {
  if (!userId) throw new Error('userId required');
  const uid = String(userId);
  const before = (this.sharedWith || []).length;
  this.sharedWith = (this.sharedWith || []).filter((s) => String(s.user) !== uid);
  if (this.sharedWith.length === before) return this; // no-op
  return this.save();
};

/**
 * List shared users (returns array of { user: ObjectId, permission, sharedAt })
 */
NoteSchema.methods.listSharedUsers = function () {
  return (this.sharedWith || []).map((s) => ({ user: s.user, permission: s.permission, sharedAt: s.sharedAt }));
};

// Helper: increment version on update
NoteSchema.methods.bumpVersion = function () {
  this.version = (this.version || 0) + 1;
  return this.version;
};

// Soft-delete helper
NoteSchema.methods.softDelete = function () {
  this.deleted = true;
  this.bumpVersion();
  return this.save();
};

const Note = mongoose.model('Note', NoteSchema);

module.exports = Note;
