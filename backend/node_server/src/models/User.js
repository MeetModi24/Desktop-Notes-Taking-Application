/**
 * User model
 * - username (unique, indexed)
 * - email (optional, unique)
 * - passwordHash (bcrypt)
 * - role (user | admin)
 * - preferences (theme, fontSize etc.)
 * - createdAt, updatedAt (timestamps)
 *
 * Exposes:
 *  - setPassword(plain)
 *  - verifyPassword(plain)
 *  - toJSON() that hides sensitive fields
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const SALT_ROUNDS = 12; // adjustable

const { Schema } = mongoose;

const PreferencesSchema = new Schema(
  {
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    fontSize: { type: Number, default: 14 }
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: false, unique: true, sparse: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
    preferences: { type: PreferencesSchema, default: () => ({}) },
    // optional: track last seen or devices
    lastSeenAt: { type: Date, default: null }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Normalize username before saving (lowercase + trim)
UserSchema.pre('save', function (next) {
  if (this.isModified('username') && this.username) {
    this.username = String(this.username).trim().toLowerCase();
  }
  next();
});

// Instance method: set password (hash)
UserSchema.methods.setPassword = async function (plainText) {
  const hash = await bcrypt.hash(String(plainText), SALT_ROUNDS);
  this.passwordHash = hash;
  return this.passwordHash;
};

// Instance method: verify password
UserSchema.methods.verifyPassword = async function (plainText) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(String(plainText), this.passwordHash);
};

// Static: find by username (case-insensitive)
UserSchema.statics.findByUsername = async function (username) {
  if (!username) return null;
  return this.findOne({ username: String(username).trim().toLowerCase() });
};

// Hide sensitive fields when returning JSON
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

const User = mongoose.model('User', UserSchema);

module.exports = User;
