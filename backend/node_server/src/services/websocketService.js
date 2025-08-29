// src/services/websocketService.js
// Initializes Socket.IO, authenticates sockets using JWT, joins `user:<userId>` room,
// exposes helpers to emit to users/note rooms, and optionally configures redis adapter.

const { Server } = require('socket.io');
const { createClient } = require('../config/redis');
const authService = require('./authService');
const User = require('../models/User');
const logger = require('../config/logger');
const config = require('../config/env');

let ioInstance = null;

/**
 * Initialize Socket.IO on existing HTTP server and attach to express app.
 * server: Node http.Server
 * app: express app (optional) - will set app.set('io', io)
 * opts: optional socket.io options (cors, path etc.)
 */
function initSocketServer(server, app = null, opts = {}) {
  if (ioInstance) return ioInstance; // singleton
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true
    },
    ...opts
  });

  // Optionally configure Redis adapter if redis is available
  try {
    const pubClient = createClient();
    const subClient = createClient(); // createClient returns a single client in our config, but it's acceptable for simple adapter usage if separate clients provided
    // lazy require adapter to avoid hard dependency if not installed
    try {
      // prefer @socket.io/redis-adapter
      // eslint-disable-next-line global-require
      const { createAdapter } = require('@socket.io/redis-adapter');
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.IO Redis adapter enabled');
    } catch (e) {
      // adapter not installed or adapter setup failed — continue without adapter
      logger.info('Socket.IO Redis adapter not configured or unavailable: %s', e.message);
    }
  } catch (e) {
    logger.debug('No redis for socket adapter: %s', e.message);
  }

  // Authenticate socket on connect
  io.use(async (socket, next) => {
    try {
      const tokenRaw = socket.handshake.auth && (socket.handshake.auth.token || socket.handshake.auth.accessToken) ||
                       socket.handshake.query && socket.handshake.query.token;
      if (!tokenRaw) return next(new Error('Authentication token required'));
      // token may be "Bearer <token>" or plain token
      const token = String(tokenRaw).startsWith('Bearer ') ? String(tokenRaw).split(' ')[1] : String(tokenRaw);
      const { valid, payload, error } = authService.verifyAccessToken(token);
      if (!valid) return next(new Error('Invalid token: ' + (error && error.message)));
      const userId = payload.sub;
      const user = await User.findById(userId).select('-passwordHash -__v').lean();
      if (!user) return next(new Error('User not found'));
      socket.data.user = { id: user._id.toString(), role: user.role };
      // join user room
      socket.join(`user:${user._id.toString()}`);
      return next();
    } catch (err) {
      logger.warn('socket auth failed: %s', err.message);
      return next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const uid = socket.data && socket.data.user && socket.data.user.id;
    logger.info('socket connected user=%s socket=%s', uid, socket.id);
    // Client can request to join a note room explicitly (to limit rooms)
    socket.on('join:note', (noteId, ack) => {
      try {
        if (!noteId) return ack && ack({ ok: false, error: 'noteId required' });
        socket.join(`note:${noteId}`);
        return ack && ack({ ok: true });
      } catch (e) {
        return ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('leave:note', (noteId, ack) => {
      try {
        if (!noteId) return ack && ack({ ok: false, error: 'noteId required' });
        socket.leave(`note:${noteId}`);
        return ack && ack({ ok: true });
      } catch (e) {
        return ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info('socket disconnected %s reason=%s', socket.id, reason);
    });
  });

  ioInstance = io;
  if (app && typeof app.set === 'function') app.set('io', io);
  return io;
}

/* ----------------------
   Helper emitters
   ---------------------- */
function emitToUser(userId, event, payload) {
  if (!ioInstance) {
    logger.debug('emitToUser skipped (no io instance)');
    return;
  }
  ioInstance.to(`user:${userId}`).emit(event, payload);
}
function emitToNote(noteId, event, payload) {
  if (!ioInstance) {
    logger.debug('emitToNote skipped (no io instance)');
    return;
  }
  ioInstance.to(`note:${noteId}`).emit(event, payload);
}

/* ----------------------
   Export
   ---------------------- */
module.exports = {
  initSocketServer,
  emitToUser,
  emitToNote,
  getIo: () => ioInstance
};
