const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const sessionManager = require('./services/sessionManager');
const setupSignalingSocket = require('./socket/signalingHandler');

const app = express();
const server = http.createServer(app);

// Enable CORS for mobile clients & web viewers
app.use(cors());
app.use(express.json());

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 10000,
  pingInterval: 5000
});

// Setup signaling logic
setupSignalingSocket(io);

// REST API Endpoints
// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'ScreenLink Signaling Server',
    stats: sessionManager.getStats()
  });
});

// POST /session - Create a new session via REST (optional alternative to socket)
app.post('/session', (req, res) => {
  try {
    const session = sessionManager.createSession('REST_INITIATED_' + Date.now());
    res.status(201).json({
      success: true,
      code: session.code,
      createdAt: session.createdAt
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /session/:code - Lookup session status
app.get('/session/:code', (req, res) => {
  const code = req.params.code;
  const session = sessionManager.getSession(code);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'SESSION_NOT_FOUND',
      message: 'El código no existe o expiró.'
    });
  }

  res.json({
    success: true,
    code: session.code,
    status: session.status,
    hasBroadcaster: Boolean(session.broadcasterId),
    hasViewer: Boolean(session.viewerId)
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`===================================================`);
  console.log(`🚀 ScreenLink Signaling Server listening on port ${PORT}`);
  console.log(`  Local Health check: http://localhost:${PORT}/health`);
  console.log(`===================================================`);
});
