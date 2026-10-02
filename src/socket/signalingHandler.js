const sessionManager = require('../services/sessionManager');

function setupSignalingSocket(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    /**
     * Broadcaster creates a new session
     */
    socket.on('create-session', (data, callback) => {
      try {
        const session = sessionManager.createSession(socket.id);
        socket.join(session.code);

        const response = {
          success: true,
          code: session.code,
          message: 'Sesión creada exitosamente.'
        };

        if (typeof callback === 'function') callback(response);
        socket.emit('session-created', response);
      } catch (err) {
        console.error('[Socket] Error creating session:', err);
        const errResp = { success: false, error: 'CREATE_FAILED', message: err.message };
        if (typeof callback === 'function') callback(errResp);
        socket.emit('error-response', errResp);
      }
    });

    /**
     * Viewer joins an existing session by code
     */
    socket.on('join-session', ({ code }, callback) => {
      if (!code) {
        const errResp = { success: false, error: 'INVALID_CODE', message: 'Se requiere un código de sesión.' };
        if (typeof callback === 'function') callback(errResp);
        return;
      }

      const result = sessionManager.joinSession(code, socket.id);
      if (!result.success) {
        if (typeof callback === 'function') callback(result);
        socket.emit('error-response', result);
        return;
      }

      const session = result.session;
      socket.join(session.code);

      const response = {
        success: true,
        code: session.code,
        broadcasterId: session.broadcasterId,
        message: 'Conectado a la sesión.'
      };

      if (typeof callback === 'function') callback(response);
      socket.emit('session-joined', response);

      // Notify Broadcaster (A) that Viewer (B) joined and requests Offer
      io.to(session.broadcasterId).emit('viewer-joined', {
        viewerId: socket.id,
        code: session.code
      });
    });

    /**
     * Relay SDP Offer from Broadcaster (A) to Viewer (B)
     */
    socket.on('offer', ({ code, offer }) => {
      const session = sessionManager.getSession(code);
      if (session && session.viewerId) {
        console.log(`[Socket] Relaying Offer from A (${socket.id}) to B (${session.viewerId}) for code ${code}`);
        io.to(session.viewerId).emit('offer', {
          broadcasterId: socket.id,
          offer
        });
      }
    });

    /**
     * Relay SDP Answer from Viewer (B) to Broadcaster (A)
     */
    socket.on('answer', ({ code, answer }) => {
      const session = sessionManager.getSession(code);
      if (session && session.broadcasterId) {
        console.log(`[Socket] Relaying Answer from B (${socket.id}) to A (${session.broadcasterId}) for code ${code}`);
        io.to(session.broadcasterId).emit('answer', {
          viewerId: socket.id,
          answer
        });
      }
    });

    /**
     * Relay ICE Candidates between peers
     */
    socket.on('ice-candidate', ({ code, candidate }) => {
      const session = sessionManager.getSession(code);
      if (!session) return;

      let targetSocketId = null;
      if (socket.id === session.broadcasterId) {
        targetSocketId = session.viewerId;
      } else if (socket.id === session.viewerId) {
        targetSocketId = session.broadcasterId;
      }

      if (targetSocketId) {
        io.to(targetSocketId).emit('ice-candidate', {
          senderId: socket.id,
          candidate
        });
      }
    });

    /**
     * Broadcaster or Viewer explicitly leaves/ends session
     */
    socket.on('leave-session', ({ code }, callback) => {
      const result = sessionManager.endSession(code, socket.id);
      if (result) {
        if (result.viewerId && result.viewerId !== socket.id) {
          io.to(result.viewerId).emit('session-ended', { message: 'El anfitrión ha finalizado la transmisión.' });
        }
        if (result.broadcasterId && result.broadcasterId !== socket.id) {
          io.to(result.broadcasterId).emit('viewer-left', { message: 'El espectador se ha desconectado.' });
        }
      }

      const response = { success: true, message: 'Sesión finalizada.' };
      if (typeof callback === 'function') callback(response);
      socket.emit('session-left', response);
    });

    /**
     * Socket disconnected
     */
    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
      const result = sessionManager.handleDisconnect(socket.id);
      if (result) {
        if (result.role === 'BROADCASTER') {
          // Broadcaster disconnected -> Notify Viewer
          if (result.otherSocketId) {
            io.to(result.otherSocketId).emit('session-ended', {
              message: 'La conexión con el anfitrión se perdió.'
            });
          }
        } else if (result.role === 'VIEWER') {
          // Viewer disconnected -> Notify Broadcaster
          if (result.otherSocketId) {
            io.to(result.otherSocketId).emit('viewer-left', {
              message: 'El espectador se ha desconectado.'
            });
          }
        }
      }
    });
  });
}

module.exports = setupSignalingSocket;
