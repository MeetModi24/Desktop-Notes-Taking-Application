/**
 * Invite model
 * - note: note being shared
 * - inviter: user who created invite (owner)
 * - email: optional invitee email (if inviting by email)
 * - tokenHash: hashed invite token (store only hash)
 * - permission: 'read'|'edit'
 * - expiresAt: Date
 * - used: boolean
 *
 * This allows owners to create one-time or time-limited invite links.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const { Schema } = mongoose;

const TOKEN_BYTES = 32;

function genTokenPlain() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}
function hashTokenPlain(plain) {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

const InviteSchema = new Schema(
  {
    note: { type: Schema.Types.ObjectId, ref: 'Note', required: true, index: true },
    inviter: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, default: null }, // optional; restrict invite acceptance to email
    tokenHash: { type: String, required: true, unique: true },
    permission: { type: String, enum: ['read', 'edit'], default: 'read' },
    expiresAt: { type: Date, default: null },
    used: { type: Boolean, default: false }
  },
  {
    timestamps: true
  }
);

// Create invite document; returns { inviteDoc, plainToken }
InviteSchema.statics.createInvite = async function ({ noteId, inviterId, permission = 'read', email = null, ttlMs = null }) {
  const plain = genTokenPlain();
  const hashed = hashTokenPlain(plain);
  const expiresAt = ttlMs ? new Date(Date.now() + Number(ttlMs)) : null;

  const doc = new this({
    note: mongoose.Types.ObjectId(noteId),
    inviter: mongoose.Types.ObjectId(inviterId),
    email: email ? String(email).trim().toLowerCase() : null,
    tokenHash: hashed,
    permission: permission === 'edit' ? 'edit' : 'read',
    expiresAt,
    used: false
  });

  await doc.save();
  return { invite: doc, token: plain };
};

// Validate and consume invite token (returns invite doc if valid)
InviteSchema.statics.consumeInvite = async function (plainToken, acceptorUserId, acceptorEmail = null) {
  const hashed = hashTokenPlain(plainToken);
  const invite = await this.findOne({ tokenHash: hashed }).exec();
  if (!invite) throw new Error('Invalid invite token');
  if (invite.used) throw new Error('Invite already used');
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    invite.used = true;
    await invite.save().catch(() => {});
    throw new Error('Invite expired');
  }
  if (invite.email && acceptorEmail) {
    if (String(invite.email).trim().toLowerCase() !== String(acceptorEmail).trim().toLowerCase()) {
      throw new Error('Invite restricted to different email');
    }
  } else if (invite.email && !acceptorEmail) {
    throw new Error('Invite requires matching email');
  }

  // mark used
  invite.used = true;
  await invite.save();

  return invite;
};

const Invite = mongoose.model('Invite', InviteSchema);

module.exports = Invite;
