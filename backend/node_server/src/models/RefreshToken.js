/**
 * RefreshToken model
 * - user: ObjectId
 * - tokenHash: hashed value of refresh token (store hash for security)
 * - deviceInfo: optional string (device id / user agent)
 * - expiresAt: Date (indexed TTL)
 * - revoked: boolean
 *
 * Notes:
 *  - You should store hashed tokens (e.g. SHA256) rather than plaintext tokens.
 *  - A TTL index on expiresAt will auto-remove expired docs (if desired).
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const RefreshTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    deviceInfo: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: true },
    revoked: { type: Boolean, default: false }
  },
  {
    timestamps: true
  }
);

// TTL index: automatically remove documents after `expiresAt` (Mongo will remove when expiresAt < now)
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Helper: revoke a token
RefreshTokenSchema.methods.revoke = function () {
  this.revoked = true;
  return this.save();
};

const RefreshToken = mongoose.model('RefreshToken', RefreshTokenSchema);

module.exports = RefreshToken;
