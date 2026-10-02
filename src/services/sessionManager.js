const { generateSessionCode } = require('../utils/codeGenerator');

class SessionManager {
  constructor() {
    // Map of sessionCode -> Session Object
    // Session: { code, broadcasterId, viewerId, createdAt, lastActive, status: 'WAITING_VIEWER' | 'CONNECTED' | 'ENDED' }
    this.sessions = new Map();
    // Map socketId -> sessionCode
    this.socketToSession = new Map();

    // Cleanup abandoned or expired sessions every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 60000);
  }

  /**
   * Create a new screen sharing session
   * @param {string} socketId - Socket ID of the broadcaster (User A)
   * @returns {Object} session info
   */
  createSession(socketId) {
    // Generate unique code
    let code;
    let attempts = 0;
    do {
      code = generateSessionCode(6);
      attempts++;
      if (attempts > 100) {
        throw new Error('Unable to generate unique session code');
      }
    } while (this.sessions.has(code));

    const session = {
      code,
      broadcasterId: socketId,
      viewerId: null,
      createdAt: Date.now(),
      lastActive: Date.now(),
      status: 'WAITING_VIEWER'
    };

    this.sessions.set(code, session);
    this.socketToSession.set(socketId, code);

    console.log(`[SessionManager] Created session ${code} for broadcaster ${socketId}`);
    return session;
  }

  /**
   * Join an existing session as viewer (User B)
   * @param {string} code - 6-character session code
   * @param {string} socketId - Socket ID of the viewer
   * @returns {Object} updated session info
   */
  joinSession(code, socketId) {
    const formattedCode = code.toUpperCase().trim();
    const session = this.sessions.get(formattedCode);

    if (!session) {
      return { success: false, error: 'SESSION_NOT_FOUND', message: 'El código no existe.' };
    }

    if (session.status === 'ENDED') {
      return { success: false, error: 'SESSION_EXPIRED', message: 'La sesión expiró o ha finalizado.' };
    }

    if (session.viewerId && session.viewerId !== socketId) {
      return { success: false, error: 'SESSION_FULL', message: 'Esta sesión ya tiene un espectador conectado.' };
    }

    session.viewerId = socketId;
    session.status = 'CONNECTED';
    session.lastActive = Date.now();

    this.socketToSession.set(socketId, formattedCode);

    console.log(`[SessionManager] Viewer ${socketId} joined session ${formattedCode}`);
    return { success: true, session };
  }

  /**
   * Get session details by code
   * @param {string} code 
   */
  getSession(code) {
    if (!code) return null;
    return this.sessions.get(code.toUpperCase().trim()) || null;
  }

  /**
   * Get session by Socket ID
   * @param {string} socketId 
   */
  getSessionBySocket(socketId) {
    const code = this.socketToSession.get(socketId);
    if (!code) return null;
    return this.sessions.get(code) || null;
  }

  /**
   * Handle user leave / disconnect
   * @param {string} socketId 
   * @returns {Object} info about affected role and session
   */
  handleDisconnect(socketId) {
    const code = this.socketToSession.get(socketId);
    if (!code) return null;

    const session = this.sessions.get(code);
    this.socketToSession.delete(socketId);

    if (!session) return null;

    if (session.broadcasterId === socketId) {
      // Broadcaster left -> session ends completely
      console.log(`[SessionManager] Broadcaster left session ${code}. Session ended.`);
      session.status = 'ENDED';
      const affectedViewer = session.viewerId;
      this.sessions.delete(code);
      return { role: 'BROADCASTER', code, otherSocketId: affectedViewer };
    } else if (session.viewerId === socketId) {
      // Viewer left -> reset session status back to WAITING_VIEWER so another viewer could connect or broadcaster knows
      console.log(`[SessionManager] Viewer left session ${code}.`);
      session.viewerId = null;
      session.status = 'WAITING_VIEWER';
      return { role: 'VIEWER', code, otherSocketId: session.broadcasterId };
    }

    return null;
  }

  /**
   * Manually end session (by broadcaster)
   * @param {string} code 
   * @param {string} socketId 
   */
  endSession(code, socketId) {
    const formattedCode = code ? code.toUpperCase().trim() : this.socketToSession.get(socketId);
    if (!formattedCode) return null;

    const session = this.sessions.get(formattedCode);
    if (!session) return null;

    const affectedViewer = session.viewerId;
    this.socketToSession.delete(session.broadcasterId);
    if (session.viewerId) {
      this.socketToSession.delete(session.viewerId);
    }
    this.sessions.delete(formattedCode);

    console.log(`[SessionManager] Manually ended session ${formattedCode}`);
    return { code: formattedCode, viewerId: affectedViewer, broadcasterId: session.broadcasterId };
  }

  /**
   * Cleanup sessions inactive for > 15 minutes
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    const TIMEOUT_MS = 15 * 60 * 1000; // 15 mins

    for (const [code, session] of this.sessions.entries()) {
      if (now - session.lastActive > TIMEOUT_MS) {
        console.log(`[SessionManager] Expiring idle session ${code}`);
        if (session.broadcasterId) this.socketToSession.delete(session.broadcasterId);
        if (session.viewerId) this.socketToSession.delete(session.viewerId);
        this.sessions.delete(code);
      }
    }
  }

  getStats() {
    return {
      activeSessions: this.sessions.size,
      totalSocketsTracked: this.socketToSession.size
    };
  }
}

module.exports = new SessionManager();
