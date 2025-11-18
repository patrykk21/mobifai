import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { TerminalManager } from './terminal-manager.js';
import { AuthManager } from './auth-manager.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS || '*',
    methods: ['GET', 'POST']
  }
});

const terminalManager = new TerminalManager();
const authManager = new AuthManager();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Generate pairing code
app.post('/api/auth/pair', (req, res) => {
  const { deviceName } = req.body;
  const pairingCode = authManager.generatePairingCode(deviceName || 'Unknown Device');

  res.json({
    pairingCode,
    serverUrl: `http://localhost:${process.env.PORT || 3000}`,
    expiresIn: 300 // 5 minutes
  });
});

// Authenticate with pairing code
app.post('/api/auth/connect', (req, res) => {
  const { pairingCode } = req.body;

  const token = authManager.verifyPairingCode(pairingCode);

  if (!token) {
    return res.status(401).json({ error: 'Invalid or expired pairing code' });
  }

  res.json({ token });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client attempting connection:', socket.id);

  // Authenticate the connection
  const token = socket.handshake.auth.token;

  if (!authManager.verifyToken(token)) {
    console.log('Authentication failed for:', socket.id);
    socket.emit('error', { message: 'Authentication failed' });
    socket.disconnect();
    return;
  }

  console.log('Client authenticated:', socket.id);

  // Create terminal session
  const terminal = terminalManager.createSession(socket.id);

  // Handle terminal output
  terminal.onData((data) => {
    socket.emit('output', data);
  });

  // Handle client input
  socket.on('input', (data: string) => {
    terminal.write(data);
  });

  // Handle terminal resize
  socket.on('resize', ({ cols, rows }: { cols: number; rows: number }) => {
    terminal.resize(cols, rows);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    terminalManager.closeSession(socket.id);
  });

  // Send welcome message
  socket.emit('connected', {
    message: 'Connected to terminal',
    sessionId: socket.id
  });
});

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0'; // Listen on all network interfaces

httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 MobiFai server running on port ${PORT}`);
  console.log(`📱 Devices can connect to:`);
  console.log(`   - Local: http://localhost:${PORT}`);
  console.log(`   - Network: http://192.168.1.35:${PORT}`);
  console.log(`💻 Terminal sessions ready`);
});
